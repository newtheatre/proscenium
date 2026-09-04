import { describe, expect, test } from 'bun:test'
import { ticketInsertQueries } from '#server/utils/capacity'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketFixtures, tonightsPerformance } from '#tests/helpers/programme'

// K-105 criterion 1: capacity is a database constraint or an atomic conditional write, never an
// application read-then-write. Split from races.test.ts so D-105 fills this on its own file.
describe('contended invariants (K-105)', () => {
  // D-105 criterion 1's named case. This proves the claim is one guarded statement whose second
  // execution writes nothing; an in-process SQLite serialises, so not that it is atomic (0022).
  test('the capacity race: concurrent claims on the last seat leave exactly one ticket', async () => {
    const database = await createTestDatabase()
    try {
      ticketFixtures(database)
      const seeded = tonightsPerformance(database, { capacityOverride: 1 })

      // Two orders for the one seat left, each shaped exactly as D-104 will batch it: the
      // reservation and its tickets together, every ticket carrying the capacity condition.
      const order = (id: string, seats: number): number => {
        database.batch([
          ['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
            id, id.toUpperCase(), seeded.performanceId, 'PENDING', 'WEB'],
          ...ticketInsertQueries(
            Array.from({ length: seats }, (_, index) => ({
              id: `${id}-t${index}`,
              reservationId: id,
              performanceId: seeded.performanceId,
              ticketTypeId: 'tt-standard',
              pricePaid: 900,
              priceSource: 'BASE' as const,
            })),
            1,
          ).map(statement => boundStatement(database, statement)),
        ])
        return rows<{ n: number }>(database, 'SELECT count(*) n FROM tickets WHERE reservation_id = ?', id)[0]?.n ?? 0
      }

      expect(order('r-one', 1)).toBe(1)
      expect(order('r-two', 1)).toBe(0)

      const held = rows<{ n: number }>(database, `
        SELECT count(*) n FROM tickets t JOIN reservations r ON r.id = t.reservation_id
        WHERE t.performance_id = ? AND t.refunded_at IS NULL AND r.status IN ('PENDING', 'COLLECTED', 'DOOR')
      `, seeded.performanceId)[0]?.n
      expect(held).toBe(1)

      // The loser's reservation exists and holds nothing, which is what the route turns into a
      // 409: no partial rows, and never one seat of a two-seat order.
      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets ORDER BY id').map(one => one.id))
        .toEqual(['r-one-t0'])
    }
    finally {
      database.close()
    }
  })

  // The other half of criterion 1: an order bigger than the house writes none of itself, rather
  // than filling the house and leaving the booker with part of a party.
  test('the capacity race: an order that will not fit writes none of its tickets', async () => {
    const database = await createTestDatabase()
    try {
      ticketFixtures(database)
      const seeded = tonightsPerformance(database, { capacityOverride: 2 })

      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
          'r-party', 'RPARTY', seeded.performanceId, 'PENDING', 'WEB'],
        ...ticketInsertQueries(
          [0, 1, 2].map(index => ({
            id: `party-t${index}`,
            reservationId: 'r-party',
            performanceId: seeded.performanceId,
            ticketTypeId: 'tt-standard',
            pricePaid: 900,
            priceSource: 'BASE' as const,
          })),
          2,
        ).map(statement => boundStatement(database, statement)),
      ])

      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets')).toEqual([])
    }
    finally {
      database.close()
    }
  })
})
