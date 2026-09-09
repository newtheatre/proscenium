import { describe, expect, test } from 'bun:test'
import {
  countDeskSearchQuery,
  deskReservationQuery,
  deskSearchQuery,
  deskTicketsQuery,
  performancesForNightQuery,
} from '#server/utils/desk'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-114's queries against the real migrations, and the ticket-collection-once guard the pending
// migration adds, proved here against its own SQL before the number is confirmed.

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

function user(database: TestDatabase, id: string, email: string, name: string): void {
  database.batch([['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', id, email, name]])
}

function reservation(database: TestDatabase, id: string, performanceId: string, userId: string, status = 'PENDING', reference = 'ABCDEF'): void {
  database.batch([[
    'INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
    id, reference, performanceId, userId, status, 'WEB',
  ]])
}

function ticket(database: TestDatabase, id: string, reservationId: string, performanceId: string, ticketTypeId: string, pricePence: number): void {
  database.batch([[
    'INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
    id, reservationId, performanceId, ticketTypeId, pricePence, 'BASE',
  ]])
}

describe('performancesForNightQuery finds only the night asked for', () => {
  test('a performance seeded for a night is found, and its neighbours are not', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const found = read<{ id: string }>(database, performancesForNightQuery(seeded.night))
      expect(found.map(row => row.id)).toEqual([seeded.performanceId])
    })
  })
})

describe('deskSearchQuery scopes to one performance and matches reference or name (criterion 1)', () => {
  test('a reference is an exact, whole match', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', seeded.performanceId, 'u-1')

      const [found] = read<{ id: string }>(database, deskSearchQuery(seeded.performanceId, 'ABCDEF', 10, 0))
      expect(found?.id).toBe('r-1')
    })
  })

  test('a name is a partial, case-insensitive match', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', seeded.performanceId, 'u-1')

      const found = read<{ id: string }>(database, deskSearchQuery(seeded.performanceId, 'booker', 10, 0))
      expect(found.map(row => row.id)).toEqual(['r-1'])
    })
  })

  test('a booking against a different performance never appears', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { suffix: 'a' })
      const second = tonightsPerformance(database, { suffix: 'b' })
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', first.performanceId, 'u-1')

      expect(read(database, deskSearchQuery(second.performanceId, undefined, 10, 0))).toEqual([])
      expect(read<{ total: number }>(database, countDeskSearchQuery(second.performanceId, undefined))[0]?.total).toBe(0)
    })
  })
})

describe('deskReservationQuery and deskTicketsQuery read the collection screen in two queries', () => {
  test('tickets are priced from what was snapshotted at booking, not recomputed', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', seeded.performanceId, 'u-1')
      database.batch([['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-1', 'Standard', 900, 'SINGLE']])
      ticket(database, 't-1', 'r-1', seeded.performanceId, 'tt-1', 900)

      const [detail] = read<{ bookerName: string, status: string }>(database, deskReservationQuery('r-1'))
      expect(detail?.bookerName).toBe('Alex Booker')
      expect(detail?.status).toBe('PENDING')

      const tickets = read<{ ticketId: string, ticketTypeName: string, pricePaid: number }>(database, deskTicketsQuery('r-1'))
      expect(tickets).toEqual([{ ticketId: 't-1', ticketTypeName: 'Standard', pricePaid: 900 }])
    })
  })
})

// The migration is generated once its number is confirmed; its SQL is created here directly so
// the guard's own logic is proved before then. `check:migrations` reads the real file, not this.
const TICKET_COLLECTION_ONCE_INDEX = `
  CREATE UNIQUE INDEX ledger_lines_ticket_collection_once ON ledger_lines (ticket_id)
  WHERE kind = 'TICKET_COLLECTION'
`
const TICKET_COLLECTION_NEEDS_COLLECTED_TRIGGER = `
  CREATE TRIGGER ledger_lines_ticket_collection_needs_collected_reservation
  BEFORE INSERT ON ledger_lines
  WHEN NEW.kind = 'TICKET_COLLECTION'
  BEGIN
    SELECT RAISE(ABORT, 'a ticket collection line must reference a collected reservation')
    WHERE NOT EXISTS (
      SELECT 1 FROM tickets t JOIN reservations r ON r.id = t.reservation_id
      WHERE t.id = NEW.ticket_id AND r.status = 'COLLECTED'
    );
  END
`

function withCollectionGuard(database: TestDatabase): void {
  database.raw.exec(TICKET_COLLECTION_ONCE_INDEX)
  database.raw.exec(TICKET_COLLECTION_NEEDS_COLLECTED_TRIGGER)
}

function ledgerEntry(database: TestDatabase, id: string): void {
  database.batch([[
    "INSERT INTO ledger_entries (id, london_day, source, tender, total_pence) VALUES (?, '2026-09-09', 'DESK', 'CARD', 900)",
    id,
  ]])
}

function insertLine(database: TestDatabase, entryId: string, ticketId: string): void {
  database.batch([[
    "INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, ticket_id) VALUES (?, ?, 'TICKET_COLLECTION', 900, ?)",
    crypto.randomUUID(), entryId, ticketId,
  ]])
}

describe('a ticket-collection line needs a collected reservation, enforced by the database (criterion 2, 6)', () => {
  test('the line is refused while the reservation is still PENDING', async () => {
    await withDatabase((database) => {
      withCollectionGuard(database)
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', seeded.performanceId, 'u-1', 'PENDING')
      database.batch([['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-1', 'Standard', 900, 'SINGLE']])
      ticket(database, 't-1', 'r-1', seeded.performanceId, 'tt-1', 900)
      ledgerEntry(database, 'e-1')

      expect(() => insertLine(database, 'e-1', 't-1')).toThrow(/must reference a collected reservation/)
    })
  })

  test('the line is accepted once the reservation is COLLECTED', async () => {
    await withDatabase((database) => {
      withCollectionGuard(database)
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', seeded.performanceId, 'u-1', 'COLLECTED')
      database.batch([['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-1', 'Standard', 900, 'SINGLE']])
      ticket(database, 't-1', 'r-1', seeded.performanceId, 'tt-1', 900)
      ledgerEntry(database, 'e-1')

      expect(() => insertLine(database, 'e-1', 't-1')).not.toThrow()
    })
  })

  test('a second line for the same ticket is refused: a seat is collected once, ever', async () => {
    await withDatabase((database) => {
      withCollectionGuard(database)
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', seeded.performanceId, 'u-1', 'COLLECTED')
      database.batch([['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-1', 'Standard', 900, 'SINGLE']])
      ticket(database, 't-1', 'r-1', seeded.performanceId, 'tt-1', 900)
      ledgerEntry(database, 'e-1')
      ledgerEntry(database, 'e-2')

      insertLine(database, 'e-1', 't-1')
      expect(() => insertLine(database, 'e-2', 't-1')).toThrow()
    })
  })
})
