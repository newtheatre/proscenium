import { describe, expect, test } from 'bun:test'
import { DOOR_TICKET_SEARCH_LIMIT, doorTicketSearchQuery } from '#server/utils/door-search'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { DoorTicketSearchRow } from '#server/utils/door-search'
import type { TestDatabase } from '#tests/helpers/database'

// Issue 1301: the door's one field finds tonight's tickets by the booker's name or the reference,
// against the real migrations. Passes keep their own lookup (D-126), so they are not here.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
    await fn(database)
  }
  finally {
    database.close()
  }
}

function search(database: TestDatabase, term: string, performanceId: string): DoorTicketSearchRow[] {
  const [query, ...parameters] = boundStatement(database, doorTicketSearchQuery(term, performanceId))
  return rows<DoorTicketSearchRow>(database, query, ...parameters)
}

function person(database: TestDatabase, id: string, name: string): string {
  database.batch([['INSERT INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', id, name, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

function booking(database: TestDatabase, id: string, performanceId: string, status: string, userId: string | null, seats: number): void {
  database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source, user_id) VALUES (?, ?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), performanceId, status, 'WEB', userId]])
  for (let seat = 0; seat < seats; seat += 1) {
    database.batch([['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
      `${id}-t${seat}`, id, performanceId, 'tt-standard', 900, 'BASE']])
  }
}

describe('a name finds tonight\'s tickets for this performance (issue 1301)', () => {
  test('part of the booker\'s name finds each live booking, with its own party size', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const mira = person(database, 'u-mira', 'Mira Halvorsen')
      const miranda = person(database, 'u-miranda', 'Miranda Price')
      booking(database, 'mira01', tonight.performanceId, 'COLLECTED', mira, 2)
      booking(database, 'miran1', tonight.performanceId, 'PENDING', miranda, 3)

      const found = search(database, 'mira', tonight.performanceId)
      expect(found.map(row => [row.reference, row.partySize, row.status])).toEqual([
        ['MIRA01', 2, 'COLLECTED'],
        ['MIRAN1', 3, 'PENDING'],
      ])
    })
  })

  test('another performance\'s booking under the same name is not tonight\'s', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database, { suffix: 'here' })
      const elsewhere = tonightsPerformance(database, { suffix: 'elsewhere' })
      const mira = person(database, 'u-mira', 'Mira Halvorsen')
      booking(database, 'there1', elsewhere.performanceId, 'COLLECTED', mira, 1)

      expect(search(database, 'Mira', tonight.performanceId)).toEqual([])
    })
  })

  test('a lapsed or cancelled booking is not offered; one already in is, with when', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const mira = person(database, 'u-mira', 'Mira Halvorsen')
      booking(database, 'lapse1', tonight.performanceId, 'EXPIRED', mira, 1)
      booking(database, 'cancl1', tonight.performanceId, 'CANCELLED', mira, 1)
      booking(database, 'inside', tonight.performanceId, 'DOOR', mira, 1)
      database.batch([['INSERT INTO audit_log (id, actor_id, action, target, created_at) VALUES (?, ?, ?, ?, ?)',
        'al-in', mira, 'reservation.admitted', 'reservation:inside', 1_790_000_000]])

      const found = search(database, 'Mira', tonight.performanceId)
      expect(found.map(row => row.reference)).toEqual(['INSIDE'])
      expect(found[0]?.admittedAt).toBe(1_790_000_000)
    })
  })

  test('the reference finds its booking whatever the case, and whoever booked it', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      booking(database, 'k7m4pq', tonight.performanceId, 'COLLECTED', null, 1)

      expect(search(database, 'k7m4pq', tonight.performanceId).map(row => row.reference)).toEqual(['K7M4PQ'])
    })
  })

  // An erased booker's name is gone (0011); the booking itself still stands at the door.
  test('an anonymised booker is never found by name, only by the reference', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const erased = person(database, 'u-erased', 'Erased Member')
      database.batch([['UPDATE users SET anonymised_at = unixepoch() WHERE id = ?', erased]])
      booking(database, 'erase1', tonight.performanceId, 'COLLECTED', erased, 1)

      expect(search(database, 'Erased', tonight.performanceId)).toEqual([])
      expect(search(database, 'ERASE1', tonight.performanceId)).toHaveLength(1)
    })
  })

  // D-126: a redeemed pass is the pass card's to admit, so its seat never lists twice.
  test('a pass admission\'s own booking is left to the pass lookup', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      const holder = person(database, 'u-holder', 'Mira Halvorsen')
      booking(database, 'passr1', tonight.performanceId, 'COLLECTED', holder, 1)
      database.batch([
        ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)', 'pt-1', 'season', 'Season pass', 1_000, 2_000],
        ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', 'price-1', 'pt-1', 'Standard'],
        ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, issued_by) VALUES (?, ?, ?, ?, ?, 0, ?)',
          'pass-1', 'PASS01', 'pt-1', 'price-1', holder, holder],
        ['INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id) VALUES (?, ?, ?, ?)',
          'admission-1', 'pass-1', tonight.performanceId, 'passr1-t0'],
      ])

      expect(search(database, 'Mira', tonight.performanceId)).toEqual([])
    })
  })

  test('a wildcard typed at the door is a character, not a pattern', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      booking(database, 'mira01', tonight.performanceId, 'COLLECTED', person(database, 'u-mira', 'Mira Halvorsen'), 1)

      expect(search(database, '%', tonight.performanceId)).toEqual([])
      expect(search(database, 'M_ra', tonight.performanceId)).toEqual([])
    })
  })

  // 0006: the statement binds the same few parameters however many bookings match.
  test('the result is capped, and the bound parameters do not grow with it', async () => {
    await withDatabase((database) => {
      const tonight = tonightsPerformance(database)
      for (let index = 0; index < DOOR_TICKET_SEARCH_LIMIT + 3; index += 1) {
        booking(database, `mira${String(index).padStart(2, '0')}`, tonight.performanceId, 'COLLECTED', person(database, `u-${index}`, `Mira ${index}`), 1)
      }
      const [, ...parameters] = boundStatement(database, doorTicketSearchQuery('Mira', tonight.performanceId))

      expect(search(database, 'Mira', tonight.performanceId)).toHaveLength(DOOR_TICKET_SEARCH_LIMIT)
      expect(parameters.length).toBeLessThan(10)
    })
  })
})
