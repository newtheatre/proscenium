import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { isDayLocked, isRangeClosed, reopenPeriod } from '#server/utils/period-locks'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { bindD1 } from '#tests/helpers/d1'
import type { TestDatabase } from '#tests/helpers/database'

// #1567: two lock rows in the same second are ordered by when they were written, never by their
// random ids, in every reader and in the ledger's own trigger (I-107, 0091).

let database: TestDatabase
const OFFICER = 'officer-1'
const DAY = '2026-03-10'
const SECOND = 1_773_140_000

beforeEach(async () => {
  database = await createTestDatabase()
  database.batch([['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', OFFICER, 'officer-1@e2e.newtheatre.org.uk', 'An officer']])
  bindD1(database)
})

afterEach(() => {
  database.close()
})

// Ids chosen against the order of writing, so an `id DESC` tie-break picks the earlier row.
function lock(id: string, action: 'CLOSED' | 'REOPENED'): void {
  database.batch([['INSERT INTO period_locks (id, from_day, to_day, action, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, DAY, DAY, action, OFFICER, SECOND]])
}

function postOnDay(id: string): void {
  database.batch([['INSERT INTO ledger_entries (id, london_day, source, tender, happened_at, total_pence) VALUES (?, ?, ?, ?, ?, ?)',
    id, DAY, 'TILL', 'CARD', SECOND + 60, 400]])
}

describe('a close and a reopen in the same second resolve to the later (#1567)', () => {
  test('closed then reopened reads as open, and the ledger takes an entry', async () => {
    lock('z-close', 'CLOSED')
    lock('a-reopen', 'REOPENED')

    expect(await isDayLocked(DAY)).toBe(false)
    expect(await isRangeClosed(DAY, DAY)).toBe(false)
    expect(() => postOnDay('entry-open')).not.toThrow()
  })

  test('reopened then closed again reads as closed, and the ledger refuses an entry', async () => {
    lock('z-reopen', 'REOPENED')
    lock('a-close', 'CLOSED')

    expect(await isDayLocked(DAY)).toBe(true)
    expect(await isRangeClosed(DAY, DAY)).toBe(true)
    expect(() => postOnDay('entry-closed')).toThrow('ledger_entries_refuses_a_closed_period')
  })

  test('a close already reopened in the same second is not reopened twice', async () => {
    lock('z-close', 'CLOSED')
    lock('a-reopen', 'REOPENED')

    expect(await reopenPeriod('z-close', OFFICER)).toBeNull()
    expect(rows(database, 'SELECT id FROM period_locks WHERE action = ?', 'REOPENED')).toHaveLength(1)
  })
})
