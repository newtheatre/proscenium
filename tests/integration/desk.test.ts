import { describe, expect, test } from 'bun:test'
import {
  countDeskSearchQuery,
  deskReservationQuery,
  deskSearchQuery,
  deskSummaryQuery,
  deskTicketsQuery,
  onShiftQuery,
  performancesForNightQuery,
} from '#server/utils/desk'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-114's queries and its ticket-collection-once guard, against the real migrations.

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

      const [found] = read<{ id: string }>(database, deskSearchQuery(seeded.performanceId, 'ABCDEF', 'ALL', 10, 0))
      expect(found?.id).toBe('r-1')
    })
  })

  test('a name is a partial, case-insensitive match', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', seeded.performanceId, 'u-1')

      const found = read<{ id: string }>(database, deskSearchQuery(seeded.performanceId, 'booker', 'ALL', 10, 0))
      expect(found.map(row => row.id)).toEqual(['r-1'])
    })
  })

  test('a booking against a different performance never appears', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { suffix: 'a' })
      const second = tonightsPerformance(database, { suffix: 'b' })
      user(database, 'u-1', 'alex@example.invalid', 'Alex Booker')
      reservation(database, 'r-1', first.performanceId, 'u-1')

      expect(read(database, deskSearchQuery(second.performanceId, undefined, 'ALL', 10, 0))).toEqual([])
      expect(read<{ total: number }>(database, countDeskSearchQuery(second.performanceId, undefined, 'ALL'))[0]?.total).toBe(0)
    })
  })
})

// The pills split the same way `qrStatusDisplay` reads a status (D-132): unpaid, paid
// whichever way it walked in, and collected narrowed to still-here.
describe('the desk status pills filter on the pending/paid/collected split', () => {
  test('UNPAID, PAID and COLLECTED each answer a different subset of ALL', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'a@example.invalid', 'A Pending')
      user(database, 'u-2', 'b@example.invalid', 'B Collected')
      user(database, 'u-3', 'c@example.invalid', 'C Admitted')
      reservation(database, 'r-1', seeded.performanceId, 'u-1', 'PENDING', 'AAA111')
      reservation(database, 'r-2', seeded.performanceId, 'u-2', 'COLLECTED', 'BBB222')
      reservation(database, 'r-3', seeded.performanceId, 'u-3', 'DOOR', 'CCC333')

      const idsFor = (status: 'ALL' | 'UNPAID' | 'PAID' | 'COLLECTED'): string[] =>
        read<{ id: string }>(database, deskSearchQuery(seeded.performanceId, undefined, status, 10, 0)).map(row => row.id)

      expect(idsFor('ALL').sort()).toEqual(['r-1', 'r-2', 'r-3'])
      expect(idsFor('UNPAID')).toEqual(['r-1'])
      expect(idsFor('PAID').sort()).toEqual(['r-2', 'r-3'])
      expect(idsFor('COLLECTED')).toEqual(['r-2'])
    })
  })
})

describe('deskSummaryQuery reads the five KPI tiles for one performance (D-132)', () => {
  test('reserved, paid and collected split the same way the status pills do, and unpaid owes what is still due', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'a@example.invalid', 'A Pending')
      user(database, 'u-2', 'b@example.invalid', 'B Collected')
      user(database, 'u-3', 'c@example.invalid', 'C Admitted')
      reservation(database, 'r-1', seeded.performanceId, 'u-1', 'PENDING', 'AAA111')
      reservation(database, 'r-2', seeded.performanceId, 'u-2', 'COLLECTED', 'BBB222')
      reservation(database, 'r-3', seeded.performanceId, 'u-3', 'DOOR', 'CCC333')
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
        ['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-access', 'Access', 0, 'SINGLE', 'ACCESS'],
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-pass', 'Pass admission', 0, 'PASS_ADMISSION'],
      ])
      ticket(database, 't-1', 'r-1', seeded.performanceId, 'tt-standard', 900)
      ticket(database, 't-2', 'r-2', seeded.performanceId, 'tt-standard', 900)
      ticket(database, 't-3', 'r-3', seeded.performanceId, 'tt-access', 0)
      ticket(database, 't-4', 'r-3', seeded.performanceId, 'tt-pass', 0)

      interface SummaryRow {
        capacity: number
        reserved: number
        paid: number
        collected: number
        unpaidCount: number
        unpaidOwedPence: number
        accessBookings: number
        passAdmissions: number
      }
      const [row] = read<SummaryRow>(database, deskSummaryQuery(seeded.performanceId))
      // Reserved and paid count tickets, not reservations: r-3's access and pass admission
      // tickets both count once each towards paid, since DOOR is money already taken.
      expect(row).toMatchObject({
        capacity: 120,
        reserved: 4,
        paid: 3,
        collected: 1,
        unpaidCount: 1,
        unpaidOwedPence: 900,
        accessBookings: 1,
        passAdmissions: 1,
      })
    })
  })
})

describe('onShiftQuery names the confirmed duty manager for the performance (D-132)', () => {
  test('only a CONFIRMED duty manager on this performance is named', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'marian@example.invalid', 'Marian')
      user(database, 'u-2', 'declined@example.invalid', 'Declined Dan')
      database.batch([
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
          'shift-1', seeded.performanceId, 'DUTY_MANAGER', 1, 'u-1', 'CONFIRMED'],
        ['INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
          'shift-2', seeded.performanceId, 'DUTY_MANAGER', 2, 'u-2', 'CLAIMED'],
      ])

      const found = read<{ name: string }>(database, onShiftQuery(seeded.performanceId))
      expect(found.map(row => row.name)).toEqual(['Marian'])
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

      const [detail] = read<{ bookerName: string, status: string, performanceId: string }>(database, deskReservationQuery('r-1'))
      expect(detail?.bookerName).toBe('Alex Booker')
      expect(detail?.status).toBe('PENDING')
      // D-116 needs this to scope tonight's duty-manager check to the right performance.
      expect(detail?.performanceId).toBe(seeded.performanceId)

      const tickets = read<{ ticketId: string, ticketTypeName: string, pricePaid: number, accessKind: string | null }>(database, deskTicketsQuery('r-1'))
      expect(tickets).toEqual([{ ticketId: 't-1', ticketTypeName: 'Standard', pricePaid: 900, accessKind: null }])
    })
  })
})

// The guard is migration 0075, applied by createTestDatabase() like any other: no separate
// setup needed here, only the rows that put it to the test.

function ledgerEntry(database: TestDatabase, id: string): void {
  database.batch([[
    'INSERT INTO ledger_entries (id, london_day, source, tender, total_pence) VALUES (?, ?, ?, ?, ?)',
    id, '2026-09-09', 'DESK', 'CARD', 900,
  ]])
}

function insertLine(database: TestDatabase, entryId: string, ticketId: string): void {
  database.batch([[
    'INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, ticket_id) VALUES (?, ?, ?, ?, ?)',
    crypto.randomUUID(), entryId, 'TICKET_COLLECTION', 900, ticketId,
  ]])
}

describe('a ticket-collection line needs a collected reservation, enforced by the database (criterion 2, 6)', () => {
  test('the line is refused while the reservation is still PENDING', async () => {
    await withDatabase((database) => {
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
