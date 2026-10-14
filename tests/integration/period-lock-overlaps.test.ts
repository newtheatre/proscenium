import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { blockingConditionsFor, closePeriod, defineTerm, isDayLocked, isRangeClosed, periodLocksHistory, periodsList, removeTerm, reopenPeriod } from '#server/utils/period-locks'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { bindD1 } from '#tests/helpers/d1'
import type { TestDatabase } from '#tests/helpers/database'

// 0129: a day is closed by at most one close in force, so the close history, the exports and the
// ledger's own trigger give one answer to "is this closed", and a second close of it is refused.

let database: TestDatabase
const TREASURER = 'treasurer-1'
const ADMIN = 'admin-1'

beforeEach(async () => {
  database = await createTestDatabase()
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', TREASURER, 'treasurer-1@e2e.newtheatre.org.uk', 'A treasurer'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', ADMIN, 'admin-1@e2e.newtheatre.org.uk', 'An administrator'],
  ])
  bindD1(database)
})

afterEach(() => {
  database.close()
})

// Imported or older history may hold what the routes now refuse: written straight, in order.
function legacyLock(id: string, fromDay: string, toDay: string, action: 'CLOSED' | 'REOPENED', at: number): void {
  database.batch([['INSERT INTO period_locks (id, from_day, to_day, action, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, fromDay, toDay, action, TREASURER, at]])
}

describe('a day already closed cannot be closed again (0129)', () => {
  test('the same range twice: the second close is refused, names the first, and writes nothing', async () => {
    const first = await closePeriod({ fromDay: '2026-09-01', toDay: '2026-09-30', label: 'September' }, TREASURER)
    expect(first.applied).toBe(true)

    const again = await closePeriod({ fromDay: '2026-09-01', toDay: '2026-09-30' }, TREASURER)
    expect(again.applied).toBe(false)
    expect(again.overlaps).toEqual([{ id: first.id, fromDay: '2026-09-01', toDay: '2026-09-30', label: 'September' }])
    expect(rows(database, 'SELECT id FROM period_locks')).toHaveLength(1)
    expect(rows(database, 'SELECT id FROM audit_log WHERE action = ?', 'finance.period.closed')).toHaveLength(1)
  })

  test('a range reaching into a closed one is refused', async () => {
    await closePeriod({ fromDay: '2026-09-01', toDay: '2026-09-30' }, TREASURER)
    expect((await closePeriod({ fromDay: '2026-09-15', toDay: '2026-10-15' }, TREASURER)).applied).toBe(false)
    expect((await closePeriod({ fromDay: '2026-08-01', toDay: '2026-09-01' }, TREASURER)).applied).toBe(false)
  })

  test('the days either side, and a reopened range, close as before', async () => {
    const september = await closePeriod({ fromDay: '2026-09-01', toDay: '2026-09-30' }, TREASURER)
    expect((await closePeriod({ fromDay: '2026-10-01', toDay: '2026-10-31' }, TREASURER)).applied).toBe(true)
    expect((await closePeriod({ fromDay: '2026-08-01', toDay: '2026-08-31' }, TREASURER)).applied).toBe(true)

    await reopenPeriod(september.id, ADMIN)
    expect((await closePeriod({ fromDay: '2026-09-01', toDay: '2026-09-30' }, TREASURER)).applied).toBe(true)
  })

  test('the preview names the close the range would overlap', async () => {
    const september = await closePeriod({ fromDay: '2026-09-01', toDay: '2026-09-30' }, TREASURER)
    expect((await blockingConditionsFor('2026-09-20', '2026-10-10')).alreadyClosed.map(lock => lock.id)).toEqual([september.id])
    expect((await blockingConditionsFor('2026-10-01', '2026-10-10')).alreadyClosed).toEqual([])
  })
})

describe('the close history says what the ledger enforces (0129)', () => {
  test('of two old closes of one range, reopening the later leaves neither listed as closed', async () => {
    legacyLock('first', '2026-09-01', '2026-09-30', 'CLOSED', 100)
    legacyLock('again', '2026-09-01', '2026-09-30', 'CLOSED', 200)

    expect(await reopenPeriod('again', ADMIN)).not.toBeNull()

    const standing = Object.fromEntries((await periodLocksHistory()).map(lock => [lock.id, lock.standing]))
    expect(standing.first).toBe('SUPERSEDED')
    expect(standing.again).toBe('SUPERSEDED')
    expect(await isDayLocked('2026-09-15')).toBe(false)
    expect(await isRangeClosed('2026-09-01', '2026-09-30')).toBe(false)
  })

  test('an old close overlapped by a later one stays in force on the days left to it', async () => {
    legacyLock('sept', '2026-09-01', '2026-09-30', 'CLOSED', 100)
    legacyLock('span', '2026-09-15', '2026-10-15', 'CLOSED', 200)

    expect(await reopenPeriod('span', ADMIN)).not.toBeNull()

    const standing = Object.fromEntries((await periodLocksHistory()).map(lock => [lock.id, lock.standing]))
    expect(standing.sept).toBe('PARTLY_CLOSED')
    expect(await isDayLocked('2026-09-10')).toBe(true)
    expect(await isDayLocked('2026-09-20')).toBe(false)
  })

  test('a close that governs no day any longer is not reopened again', async () => {
    legacyLock('first', '2026-09-01', '2026-09-30', 'CLOSED', 100)
    legacyLock('again', '2026-09-01', '2026-09-30', 'CLOSED', 200)
    expect(await reopenPeriod('first', ADMIN)).toBeNull()
    expect(rows(database, 'SELECT id FROM period_locks WHERE action = ?', 'REOPENED')).toEqual([])
  })

  test('a reopen carries the label of the close it reopens', async () => {
    const september = await closePeriod({ fromDay: '2026-09-01', toDay: '2026-09-30', label: 'September' }, TREASURER)
    const reopened = await reopenPeriod(september.id, ADMIN)
    expect(rows(database, 'SELECT label FROM period_locks WHERE id = ?', reopened!.id)).toEqual([{ label: 'September' }])
  })
})

describe('a term is named once, and a mistaken one can be taken away (0129)', () => {
  test('the same label again is refused, whatever its case or its dates', async () => {
    expect((await defineTerm({ label: 'Autumn 2026', fromDay: '2026-09-28', toDay: '2026-12-11' }, TREASURER)).applied).toBe(true)
    expect((await defineTerm({ label: 'autumn 2026', fromDay: '2026-09-21', toDay: '2026-12-11' }, TREASURER)).applied).toBe(false)
    expect(await periodsList()).toHaveLength(1)
  })

  test('the same dates again under another label are refused', async () => {
    await defineTerm({ label: 'Autumn 2026', fromDay: '2026-09-28', toDay: '2026-12-11' }, TREASURER)
    expect((await defineTerm({ label: 'Michaelmas', fromDay: '2026-09-28', toDay: '2026-12-11' }, TREASURER)).applied).toBe(false)
  })

  test('removing a term takes it off the list and is audited; nothing it named was a close', async () => {
    const term = await defineTerm({ label: 'Autumn 2026', fromDay: '2026-09-28', toDay: '2026-12-11' }, TREASURER)
    await closePeriod({ fromDay: '2026-09-28', toDay: '2026-12-11', label: 'Autumn 2026' }, TREASURER)

    expect(await removeTerm(term.id, TREASURER)).toBe(true)
    expect(await periodsList()).toEqual([])
    expect(rows(database, 'SELECT id FROM audit_log WHERE action = ?', 'finance.period.removed')).toHaveLength(1)
    expect(await isDayLocked('2026-10-01')).toBe(true)
    expect(await removeTerm(term.id, TREASURER)).toBe(false)
  })
})
