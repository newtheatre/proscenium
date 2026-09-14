import { describe, expect, test } from 'bun:test'
import { tillBookingByIdQuery, tillBookingByReferenceQuery } from '#server/utils/till-bookings'
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
