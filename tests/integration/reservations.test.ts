import { describe, expect, test } from 'bun:test'
import {
  bookableTicketTypesQuery,
  currentTicketLinesQuery,
  heldAccessCountsQuery,
  namedTicketLinesQuery,
  reservationCurrentStateQuery,
  reservationForDoorQuery,
  reservationForResendQuery,
  selfServiceReservationQuery,
} from '#server/utils/reservations'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { BookableTicketTypeRow } from '#server/utils/reservations'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// The queries D-104, D-108 and D-109 read against the real migrations. What each row means once
// read is tests/unit/reservations.test.ts's pure rules.

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

function user(database: TestDatabase, id: string, email: string): void {
  database.batch([['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', id, email, 'A Booker']])
}

describe('bookableTicketTypesQuery reads restricted_to alongside the price chain (D-109 criterion 1)', () => {
  test('an open type and a member-restricted type both come back, filtering is left to the caller', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
        ['INSERT INTO ticket_types (id, name, price, kind, restricted_to) VALUES (?, ?, ?, ?, ?)', 'tt-member', 'Member', 500, 'SINGLE', 'MEMBER'],
      ])

      const found = read<BookableTicketTypeRow>(database, bookableTicketTypesQuery(seeded.performanceId, seeded.showId, false))
      expect(found.map(row => row.id).sort()).toEqual(['tt-member', 'tt-standard'])
      expect(found.find(row => row.id === 'tt-member')?.restrictedTo).toBe('MEMBER')
      expect(found.find(row => row.id === 'tt-standard')?.restrictedTo).toBeNull()
    })
  })

  test('an access or companion type never appears for a caller with no entitlement, whatever it is restricted to', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-access', 'Access', 0, 'SINGLE', 'ACCESS'],
      ])

      const found = read<BookableTicketTypeRow>(database, bookableTicketTypesQuery(seeded.performanceId, seeded.showId, false))
      expect(found).toEqual([])
    })
  })

  test('an access or companion type appears once the caller is entitled to be offered one (D-128 criterion 1)', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-access', 'Access', 700, 'SINGLE', 'ACCESS'],
        ['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-companion', 'Companion', 0, 'SINGLE', 'COMPANION'],
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
      ])

      const found = read<BookableTicketTypeRow>(database, bookableTicketTypesQuery(seeded.performanceId, seeded.showId, true))
      expect(found.map(row => row.id).sort()).toEqual(['tt-access', 'tt-companion', 'tt-standard'])
      expect(found.find(row => row.id === 'tt-access')?.accessKind).toBe('ACCESS')
      expect(found.find(row => row.id === 'tt-companion')?.accessKind).toBe('COMPANION')
    })
  })

  test('a performance override joins onto the right row, not every row', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
        ['INSERT INTO performance_ticket_overrides (id, performance_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
          'po-1', seeded.performanceId, 'tt-standard', 500],
      ])

      const [found] = read<BookableTicketTypeRow>(database, bookableTicketTypesQuery(seeded.performanceId, seeded.showId, false))
      expect(found?.performancePrice).toBe(500)
      expect(found?.showPrice).toBeNull()
    })
  })
})

describe('what a booker already holds against a performance, any source (D-128 criterion 2)', () => {
  test('access and companion tickets are counted separately, refunded and non-holding ones excluded', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'booker@example.invalid')
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-access', 'Access', 700, 'SINGLE', 'ACCESS'],
        ['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)', 'tt-companion', 'Companion', 0, 'SINGLE', 'COMPANION'],
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'AB1234', seeded.performanceId, 'u-1', 'PENDING', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-1', 'r-1', seeded.performanceId, 'tt-access', 700, 'BASE'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-2', 'r-1', seeded.performanceId, 'tt-companion', 0, 'BASE'],
        // A desk-sourced reservation counts too: entitlement is channel-blind (criterion 2).
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-2', 'CD5678', seeded.performanceId, 'u-1', 'COLLECTED', 'DESK'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-3', 'r-2', seeded.performanceId, 'tt-companion', 0, 'BASE'],
        // A refunded ticket and a cancelled reservation's ticket hold nothing.
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-3', 'EF9012', seeded.performanceId, 'u-1', 'CANCELLED', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-4', 'r-3', seeded.performanceId, 'tt-companion', 0, 'BASE'],
      ])
      database.batch([['UPDATE tickets SET refunded_at = ? WHERE id = ?', 1_800_000_000, 't-2']])

      const found = read<{ accessKind: string, n: number }>(database, heldAccessCountsQuery('u-1', seeded.performanceId))
      const byKind = Object.fromEntries(found.map(row => [row.accessKind, Number(row.n)]))
      expect(byKind.ACCESS).toBe(1)
      expect(byKind.COMPANION).toBe(1)
    })
  })
})

describe('a resend reads the booker, the template fields and a summed total in one row (criterion 2)', () => {
  test('the total is the sum of this reservation\'s tickets, not every ticket sold', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'booker@example.invalid')
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'ABCDEF', seeded.performanceId, 'u-1', 'PENDING', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-1', 'r-1', seeded.performanceId, 'tt-standard', 900, 'BASE'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-2', 'r-1', seeded.performanceId, 'tt-standard', 900, 'BASE'],
      ])

      const [found] = read<{ id: string, userId: string, totalPence: number, showTitle: string }>(
        database, reservationForResendQuery('ABCDEF'),
      )
      expect(found?.id).toBe('r-1')
      expect(found?.userId).toBe('u-1')
      expect(found?.totalPence).toBe(1800)
      expect(found?.showTitle).toBe('A Test Show')
    })
  })

  test('an unknown reference reads nothing, the shape a refused enumeration attempt gets', async () => {
    await withDatabase((database) => {
      expect(read(database, reservationForResendQuery('ZZZZZZ'))).toEqual([])
    })
  })
})

describe('the door reads a reservation by reference alone, not scoped to a performance (E-127 criterion 3)', () => {
  test('carries the performance it actually belongs to, for a door that chose a different one', async () => {
    await withDatabase((database) => {
      const matinee = tonightsPerformance(database, { suffix: 'matinee' })
      const evening = tonightsPerformance(database, { suffix: 'evening', venueId: matinee.venueId })
      user(database, 'u-1', 'booker@example.invalid')
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'ABCDEF', matinee.performanceId, 'u-1', 'COLLECTED', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-1', 'r-1', matinee.performanceId, 'tt-standard', 900, 'BASE'],
      ])

      const [found] = read<{ id: string, status: string, performanceId: string, showTitle: string }>(
        database, reservationForDoorQuery('ABCDEF'),
      )
      expect(found?.id).toBe('r-1')
      expect(found?.status).toBe('COLLECTED')
      expect(found?.performanceId).toBe(matinee.performanceId)
      expect(found?.performanceId).not.toBe(evening.performanceId)
    })
  })

  test('matches regardless of the case typed at the door', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'booker@example.invalid')
      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'ABCDEF', seeded.performanceId, 'u-1', 'PENDING', 'WEB'],
      ])

      expect(read(database, reservationForDoorQuery('abcdef'))).toHaveLength(1)
    })
  })

  test('an unknown reference reads nothing', async () => {
    await withDatabase((database) => {
      expect(read(database, reservationForDoorQuery('ZZZZZZ'))).toEqual([])
    })
  })
})

describe('the current state a QR answers with is read live from the row (D-108 criterion 1)', () => {
  test('a cancelled reservation carries who cancelled it', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'booker@example.invalid')
      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source, cancelled_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
          'r-1', 'ABCDEF', seeded.performanceId, 'u-1', 'CANCELLED', 'WEB', 'CUSTOMER'],
      ])

      const [found] = read<{ status: string, cancelledBy: string | null }>(database, reservationCurrentStateQuery('r-1'))
      expect(found?.status).toBe('CANCELLED')
      expect(found?.cancelledBy).toBe('CUSTOMER')
    })
  })
})

describe('what a self-service write needs about its own reservation (D-110, D-111)', () => {
  test('carries the performance\'s show and start, not just its own id', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'booker@example.invalid')
      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'ABCDEF', seeded.performanceId, 'u-1', 'PENDING', 'WEB'],
      ])

      const [found] = read<{ id: string, status: string, performanceId: string, showId: string }>(
        database, selfServiceReservationQuery('r-1'),
      )
      expect(found?.status).toBe('PENDING')
      expect(found?.performanceId).toBe(seeded.performanceId)
      expect(found?.showId).toBe(seeded.showId)
    })
  })
})

describe('the current ticket lines an edit reads as its "have" side (D-110 criterion 1)', () => {
  test('grouped by type, unrefunded only', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'booker@example.invalid')
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'ABCDEF', seeded.performanceId, 'u-1', 'PENDING', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-1', 'r-1', seeded.performanceId, 'tt-standard', 900, 'BASE'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-2', 'r-1', seeded.performanceId, 'tt-standard', 900, 'BASE'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source, refunded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          't-3', 'r-1', seeded.performanceId, 'tt-standard', 900, 'BASE', 1_700_000_000],
      ])

      const [found] = read<{ ticketTypeId: string, quantity: number }>(database, currentTicketLinesQuery('r-1'))
      expect(found).toEqual({ ticketTypeId: 'tt-standard', quantity: 2 })
    })
  })
})

describe('the named ticket lines a screen reads (D-110)', () => {
  test('carries the type\'s name alongside the count', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      user(database, 'u-1', 'booker@example.invalid')
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-standard', 'Standard', 900, 'SINGLE'],
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-1', 'ABCDEF', seeded.performanceId, 'u-1', 'PENDING', 'WEB'],
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
          't-1', 'r-1', seeded.performanceId, 'tt-standard', 900, 'BASE'],
      ])

      const [found] = read<{ ticketTypeId: string, ticketTypeName: string, quantity: number }>(database, namedTicketLinesQuery('r-1'))
      expect(found).toEqual({ ticketTypeId: 'tt-standard', ticketTypeName: 'Standard', quantity: 1 })
    })
  })
})
