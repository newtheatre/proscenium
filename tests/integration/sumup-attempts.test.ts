import { describe, expect, test } from 'bun:test'
import { recordPostedSaleStatement, stuckAttemptsQuery } from '#server/utils/sumup-queries'
import { tillBookingByIdQuery, tillBookingByReferenceQuery } from '#server/utils/till-bookings'
import { SUMUP_STUCK_COMPLETING_MINUTES } from '#shared/utils/sumup'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance, ticketTypeFixture } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// F-124 on the real migrations: transitions are conditional writes and the schema refuses an
// entry on anything but a success. F-122, F-123: the Tickets tab's reads, an anonymous walk-up too.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function person(database: TestDatabase, suffix = '1'): string {
  const id = `u-${suffix}`
  insert(database, 'users', { id, email: `person-${suffix}@example.invalid`, name: `Person ${suffix}` })
  return id
}

function attempt(database: TestDatabase, id: string, sessionId: string, venueId: string, createdBy: string, status = 'STARTED'): void {
  insert(database, 'sumup_attempts', {
    id, till_session_id: sessionId, venue_id: venueId, night: '2026-09-14', created_by: createdBy,
    basket: '{}', expected_total_pence: 250, status,
  })
}

// The claim every transition rides: the predicate is on the statement (0001, 0003), and the row
// count is what decides whether this caller's answer landed.
const move = (database: TestDatabase, id: string, from: string, to: string): number =>
  rows<{ id: string }>(database, 'UPDATE sumup_attempts SET status = ? WHERE id = ? AND status = ? RETURNING id', to, id, from).length

describe('an attempt advances once, whoever asks (F-124 criterion 5)', () => {
  test('two answers claiming a started attempt leave one completing and one refused', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const { venueId } = tonightsPerformance(database, { suffix: 'a' })
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-14', opened_by: opener, opened_at: 1000 })
      attempt(database, 'att-1', 't-1', venueId, opener)

      expect(move(database, 'att-1', 'STARTED', 'COMPLETING')).toBe(1)
      expect(move(database, 'att-1', 'STARTED', 'COMPLETING')).toBe(0)
      expect(rows<{ status: string }>(database, 'SELECT status FROM sumup_attempts WHERE id = ?', 'att-1')[0]!.status).toBe('COMPLETING')
    })
  })

  test('a status outside the vocabulary is refused by the schema', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const { venueId } = tonightsPerformance(database, { suffix: 'b' })
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-14', opened_by: opener, opened_at: 1000 })
      expect(() => attempt(database, 'att-x', 't-1', venueId, opener, 'PAID')).toThrow()
    })
  })

  test('a ledger entry can only be recorded against a success (criterion 2)', async () => {
    await withDatabase((database) => {
      const opener = person(database)
      const { venueId } = tonightsPerformance(database, { suffix: 'c' })
      insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-14', opened_by: opener, opened_at: 1000 })
      attempt(database, 'att-1', 't-1', venueId, opener)

      expect(() => database.batch([['UPDATE sumup_attempts SET entry_id = ? WHERE id = ?', 'entry-1', 'att-1']])).toThrow()
      database.batch([['UPDATE sumup_attempts SET status = ?, entry_id = ? WHERE id = ?', 'SUCCEEDED', 'entry-1', 'att-1']])
      expect(rows<{ entryId: string }>(database, 'SELECT entry_id AS entryId FROM sumup_attempts WHERE id = ?', 'att-1')[0]!.entryId).toBe('entry-1')
    })
  })
})

// A commit that lands after the sweep has already given up on the row: the sale is posted, so
// the row must say so and name its entry, and no later answer may post a second one.
describe('a completion posts once, whatever the sweep did meanwhile (F-124 criterion 5)', () => {
  function completing(database: TestDatabase, id = 'att-1'): void {
    const opener = person(database)
    const { venueId } = tonightsPerformance(database, { suffix: `r-${id}` })
    insert(database, 'till_sessions', { id: 't-1', venue_id: venueId, night: '2026-09-14', opened_by: opener, opened_at: 1000 })
    attempt(database, id, 't-1', venueId, opener, 'COMPLETING')
  }

  const record = (database: TestDatabase, id: string, entryId: string, at: number): number =>
    read<{ id: string }>(database, recordPostedSaleStatement(id, entryId, at)).length

  const state = (database: TestDatabase, id: string): { status: string, entryId: string | null } =>
    rows<{ status: string, entryId: string | null }>(database, 'SELECT status, entry_id AS entryId FROM sumup_attempts WHERE id = ?', id)[0]!

  test('the sale is recorded on the row even though a sweep mismatched it first', async () => {
    await withDatabase((database) => {
      completing(database)
      expect(move(database, 'att-1', 'COMPLETING', 'MISMATCH')).toBe(1)

      expect(record(database, 'att-1', 'entry-1', 2000)).toBe(1)
      expect(state(database, 'att-1')).toEqual({ status: 'SUCCEEDED', entryId: 'entry-1' })
    })
  })

  test('a row that already names an entry records nothing a second time', async () => {
    await withDatabase((database) => {
      completing(database)
      expect(record(database, 'att-1', 'entry-1', 2000)).toBe(1)
      expect(record(database, 'att-1', 'entry-2', 2100)).toBe(0)
      expect(state(database, 'att-1').entryId).toBe('entry-1')
    })
  })

  // The replay half of the same defect: staff answering "it did go through" on a mismatch whose
  // sale was in fact posted must not be able to claim the row and commit the basket again.
  test('a replay cannot claim a row whose sale is already posted', async () => {
    await withDatabase((database) => {
      completing(database)
      record(database, 'att-1', 'entry-1', 2000)

      const claimed = rows<{ id: string }>(
        database,
        `UPDATE sumup_attempts SET status = 'COMPLETING' WHERE id = ? AND status IN ('STARTED', 'MISMATCH') AND entry_id IS NULL RETURNING id`,
        'att-1',
      ).length
      expect(claimed).toBe(0)
      expect(state(database, 'att-1').status).toBe('SUCCEEDED')
    })
  })
})

// The stuck clock runs from the answer, not from the hand-off: an attempt answered a moment ago
// is still in flight however long ago it was started (F-124 criterion 6).
describe('a completion is stuck when its answer is old, not when its hand-off is', () => {
  const NOW = 1_789_000_000
  const minutes = (count: number): number => count * 60

  function attemptAt(database: TestDatabase, id: string, over: { status: string, createdAt: number, callbackAt: number | null }): void {
    const opener = person(database, id)
    const { venueId } = tonightsPerformance(database, { suffix: `s-${id}` })
    insert(database, 'till_sessions', { id: `t-${id}`, venue_id: venueId, night: '2026-09-14', opened_by: opener, opened_at: 1000 })
    insert(database, 'sumup_attempts', {
      id, till_session_id: `t-${id}`, venue_id: venueId, night: '2026-09-14', created_by: opener,
      basket: '{}', expected_total_pence: 250, status: over.status, created_at: over.createdAt, callback_at: over.callbackAt,
    })
  }

  const stuck = (database: TestDatabase): string[] =>
    read<{ id: string }>(database, stuckAttemptsQuery(NOW, 120)).map(row => row.id)

  test('a completion answered inside the window is left alone, however old the hand-off', async () => {
    await withDatabase((database) => {
      attemptAt(database, 'att-fresh', {
        status: 'COMPLETING',
        createdAt: NOW - minutes(90),
        callbackAt: NOW - minutes(SUMUP_STUCK_COMPLETING_MINUTES - 1),
      })

      expect(stuck(database)).toEqual([])
    })
  })

  test('a completion answered before the window is stuck', async () => {
    await withDatabase((database) => {
      attemptAt(database, 'att-stale', {
        status: 'COMPLETING',
        createdAt: NOW - minutes(90),
        callbackAt: NOW - minutes(SUMUP_STUCK_COMPLETING_MINUTES + 1),
      })

      expect(stuck(database)).toEqual(['att-stale'])
    })
  })

  test('a completion never answered falls back to its hand-off', async () => {
    await withDatabase((database) => {
      attemptAt(database, 'att-silent', { status: 'COMPLETING', createdAt: NOW - minutes(90), callbackAt: null })

      expect(stuck(database)).toEqual(['att-silent'])
    })
  })

  test('a hand-off nobody answered is swept on its own timeout', async () => {
    await withDatabase((database) => {
      attemptAt(database, 'att-open', { status: 'STARTED', createdAt: NOW - minutes(121), callbackAt: null })
      attemptAt(database, 'att-recent', { status: 'STARTED', createdAt: NOW - minutes(119), callbackAt: null })

      expect(stuck(database)).toEqual(['att-open'])
    })
  })
})

describe('the Tickets tab reads a booking with or without an account behind it (F-122, F-123)', () => {
  test('a walk-up sold with no name is found by its reference and reads as a walk-up', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database, { suffix: 'd' })
      ticketTypeFixture(database)
      insert(database, 'reservations', { id: 'r-anon', reference: 'WALKUP', performance_id: performanceId, user_id: null, status: 'COLLECTED', source: 'DOOR' })
      insert(database, 'tickets', { id: 'tk-1', reservation_id: 'r-anon', performance_id: performanceId, ticket_type_id: 'tt-standard', price_paid: 900, price_source: 'BASE' })

      const [found] = read<{ reference: string, bookerName: string | null, partySize: number, owedPence: number, status: string }>(database, tillBookingByReferenceQuery('walkup'))
      expect(found?.reference).toBe('WALKUP')
      expect(found?.bookerName).toBeNull()
      expect(Number(found?.partySize)).toBe(1)
      expect(Number(found?.owedPence)).toBe(900)
      expect(found?.status).toBe('COLLECTED')
    })
  })

  test('a pending booking reads what is owed, less any refunded ticket', async () => {
    await withDatabase((database) => {
      const booker = person(database, 'booker')
      const { performanceId } = tonightsPerformance(database, { suffix: 'e' })
      ticketTypeFixture(database)
      insert(database, 'reservations', { id: 'r-1', reference: 'ABCDEF', performance_id: performanceId, user_id: booker, status: 'PENDING', source: 'WEB' })
      insert(database, 'tickets', { id: 'tk-1', reservation_id: 'r-1', performance_id: performanceId, ticket_type_id: 'tt-standard', price_paid: 900, price_source: 'BASE' })
      insert(database, 'tickets', { id: 'tk-2', reservation_id: 'r-1', performance_id: performanceId, ticket_type_id: 'tt-standard', price_paid: 900, price_source: 'BASE', refunded_at: 5 })

      const [found] = read<{ bookerName: string, partySize: number, owedPence: number }>(database, tillBookingByIdQuery('r-1'))
      expect(found?.bookerName).toBe('Person booker')
      expect(Number(found?.partySize)).toBe(1)
      expect(Number(found?.owedPence)).toBe(900)
    })
  })
})
