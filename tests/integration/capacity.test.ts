import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import {
  TICKETS_HOLD_SEATS,
  capacityAllows,
  heldSeatsColumn,
  heldSeatsQuery,
  loweringPredicate,
  ticketInsertQueries,
} from '#server/utils/capacity'
import { performanceSoldColumn, performanceSoldQuery, showSoldColumn } from '#server/utils/programme'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketFixtures, tonightsPerformance } from '#tests/helpers/programme'
import type { TicketToWrite } from '#server/utils/capacity'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-105 against the real rule. The tables it counts are D-104's, stood up here as
// `docs/data-model.md` specifies them; the contended case is the named race in races.test.ts.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketFixtures(database)
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

function run(database: TestDatabase, statements: SQL[]): void {
  database.batch(statements.map(statement => boundStatement(database, statement)))
}

const ticket = (id: string, performanceId: string, reservationId: string): TicketToWrite => ({
  id,
  reservationId,
  performanceId,
  ticketTypeId: 'tt-standard',
  pricePaid: 900,
  priceSource: 'BASE',
})

function reserve(database: TestDatabase, id: string, performanceId: string, status = 'PENDING'): string {
  database.batch([[
    'INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
    id, id.toUpperCase().slice(0, 6), performanceId, status, 'WEB',
  ]])
  return id
}

// What D-118 will write: the check rides the statement that puts the seats back, so a reservation
// cannot be reinstated over somebody who took the seat meanwhile.
function reinstate(reservationId: string, performanceId: string, capacity: number): SQL {
  return sql`
    UPDATE reservations SET status = 'PENDING'
    WHERE id = ${reservationId}
      AND status IN ('EXPIRED', 'CANCELLED')
      AND ${capacityAllows(performanceId, capacity, 1)}
  `
}

function heldSeats(database: TestDatabase, performanceId: string): number {
  return Number(read<{ held: number }>(database, heldSeatsQuery(performanceId))[0]?.held ?? -1)
}

describe('capacity is counted, never stored (D-105 criterion 2)', () => {
  test('a held ticket counts and a released one does not', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 10 })
      for (const [index, status] of ['PENDING', 'COLLECTED', 'DOOR', 'EXPIRED', 'CANCELLED', 'NO_SHOW'].entries()) {
        const reservation = reserve(database, `r-${index}`, seeded.performanceId, status)
        run(database, ticketInsertQueries([ticket(`t-${index}`, seeded.performanceId, reservation)], null))
      }
      expect(heldSeats(database, seeded.performanceId)).toBe(3)
    })
  })

  test('a refunded ticket leaves the count at once, whatever its reservation says', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 10 })
      const reservation = reserve(database, 'r-1', seeded.performanceId, 'COLLECTED')
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, reservation)], null))
      expect(heldSeats(database, seeded.performanceId)).toBe(1)

      database.batch([['UPDATE tickets SET refunded_at = ? WHERE id = ?', 1_780_000_000, 't-1']])
      expect(heldSeats(database, seeded.performanceId)).toBe(0)
    })
  })

  // Cancelling a reservation is one UPDATE and the seat is back. Nothing sweeps, and no second
  // record of how full the house is can drift from this one.
  test('cancelling a reservation frees its seats with nothing else to do', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 10 })
      const reservation = reserve(database, 'r-1', seeded.performanceId)
      run(database, ticketInsertQueries([
        ticket('t-1', seeded.performanceId, reservation),
        ticket('t-2', seeded.performanceId, reservation),
      ], null))
      expect(heldSeats(database, seeded.performanceId)).toBe(2)

      database.batch([['UPDATE reservations SET status = ? WHERE id = ?', 'CANCELLED', reservation]])
      expect(heldSeats(database, seeded.performanceId)).toBe(0)
    })
  })

  test('one performance never counts another\'s seats', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { capacityOverride: 10 })
      const second = tonightsPerformance(database, { suffix: 'b', capacityOverride: 10 })
      run(database, ticketInsertQueries([ticket('t-1', first.performanceId, reserve(database, 'r-1', first.performanceId))], null))

      expect(heldSeats(database, first.performanceId)).toBe(1)
      expect(heldSeats(database, second.performanceId)).toBe(0)
    })
  })

  // A listing reads many performances at once and must not bind a parameter per performance, so
  // the same count is available correlated to a row already in hand (0006).
  test('the correlated column answers the same question for a whole list of performances', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { capacityOverride: 10 })
      const second = tonightsPerformance(database, { suffix: 'b', capacityOverride: 10 })
      run(database, ticketInsertQueries([ticket('t-1', first.performanceId, reserve(database, 'r-1', first.performanceId))], null))

      const statement = sql`SELECT p.id AS id, ${heldSeatsColumn('p')} AS held FROM performances p ORDER BY p.id`
      const [, ...parameters] = boundStatement(database, statement)
      expect(parameters).toEqual([])

      const counted = read<{ id: string, held: number }>(database, statement)
      expect(counted.find(one => one.id === first.performanceId)?.held).toBe(1)
      expect(counted.find(one => one.id === second.performanceId)?.held).toBe(0)
    })
  })
})

describe('an insert carries its own capacity check (D-105 criterion 2)', () => {
  test('the last seat is taken and the next attempt writes nothing', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 1 })
      const first = reserve(database, 'r-1', seeded.performanceId)
      const second = reserve(database, 'r-2', seeded.performanceId)

      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, first)], 1))
      run(database, ticketInsertQueries([ticket('t-2', seeded.performanceId, second)], 1))

      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets ORDER BY id').map(one => one.id)).toEqual(['t-1'])
    })
  })

  // Criterion 1: the loser writes no partial rows. Every statement in an order carries the same
  // condition, so an order of four into a house with three left writes none of the four.
  test('an order too big for the house writes none of it', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 3 })
      const reservation = reserve(database, 'r-1', seeded.performanceId)

      run(database, ticketInsertQueries(
        [1, 2, 3, 4].map(n => ticket(`t-${n}`, seeded.performanceId, reservation)),
        3,
      ))

      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets')).toEqual([])
      expect(heldSeats(database, seeded.performanceId)).toBe(0)
    })
  })

  test('an order that exactly fills the house writes all of it', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 3 })
      const reservation = reserve(database, 'r-1', seeded.performanceId)

      run(database, ticketInsertQueries(
        [1, 2, 3].map(n => ticket(`t-${n}`, seeded.performanceId, reservation)),
        3,
      ))

      expect(heldSeats(database, seeded.performanceId)).toBe(3)
    })
  })

  test('an uncapped venue takes an order of any size', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: null, venueCapacity: null })
      const reservation = reserve(database, 'r-1', seeded.performanceId)
      run(database, ticketInsertQueries([1, 2, 3].map(n => ticket(`t-${n}`, seeded.performanceId, reservation)), null))
      expect(heldSeats(database, seeded.performanceId)).toBe(3)
    })
  })

  test('a seat freed by a cancellation is available to the next order', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 1 })
      const first = reserve(database, 'r-1', seeded.performanceId)
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, first)], 1))

      database.batch([['UPDATE reservations SET status = ? WHERE id = ?', 'EXPIRED', first]])

      const second = reserve(database, 'r-2', seeded.performanceId)
      run(database, ticketInsertQueries([ticket('t-2', seeded.performanceId, second)], 1))

      expect(heldSeats(database, seeded.performanceId)).toBe(1)
      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets ORDER BY id').map(one => one.id)).toEqual(['t-1', 't-2'])
    })
  })

  test('no statement binds a parameter per row, whatever the order size', async () => {
    await withDatabase((database) => {
      const tickets = Array.from({ length: 10 }, (_, index) => ticket(`t-${index}`, 'performance-a', 'r-1'))
      for (const statement of ticketInsertQueries(tickets, 200)) {
        const [query, ...parameters] = boundStatement(database, statement)
        expect(parameters.length).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
        expect(query).not.toContain(' IN (?')
      }
    })
  })
})

// Criterion 3's second half: reinstating a released reservation re-runs the check on the statement
// that reinstates it, so it cannot be reinstated over somebody who took the seat meanwhile.
describe('a status change back into the house is checked too (D-105 criterion 3, D-118)', () => {
  test('reinstating fits when the house has room', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 2 })
      const reservation = reserve(database, 'r-1', seeded.performanceId, 'EXPIRED')
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, reservation)], null))

      run(database, [reinstate(reservation, seeded.performanceId, 2)])

      expect(heldSeats(database, seeded.performanceId)).toBe(1)
    })
  })

  test('reinstating over a resold seat writes nothing', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 1 })
      const lapsed = reserve(database, 'r-1', seeded.performanceId, 'EXPIRED')
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, lapsed)], null))

      const resold = reserve(database, 'r-2', seeded.performanceId)
      run(database, ticketInsertQueries([ticket('t-2', seeded.performanceId, resold)], 1))
      expect(heldSeats(database, seeded.performanceId)).toBe(1)

      run(database, [reinstate(lapsed, seeded.performanceId, 1)])

      const status = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', lapsed)
      expect(status[0]?.status).toBe('EXPIRED')
      expect(heldSeats(database, seeded.performanceId)).toBe(1)
    })
  })
})

// The point of writing the registry row now: D-104 pushes a constant and the counts are already
// right, rather than deciding the rule a second time under time pressure.
describe('the row D-104 will push already counts seats correctly (D-105)', () => {
  test('a performance holds the seats its live reservations hold, and no expired ones', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 10 })
      const live = reserve(database, 'r-live', seeded.performanceId)
      const lapsed = reserve(database, 'r-lapsed', seeded.performanceId, 'EXPIRED')
      run(database, ticketInsertQueries([
        ticket('t-1', seeded.performanceId, live),
        ticket('t-2', seeded.performanceId, live),
      ], null))
      run(database, ticketInsertQueries([ticket('t-3', seeded.performanceId, lapsed)], null))

      const references = [TICKETS_HOLD_SEATS]
      const [counted] = read<{ sold: number }>(database, performanceSoldQuery(seeded.performanceId, references))
      expect(counted?.sold).toBe(2)

      const listed = read<{ id: string, soldTickets: number }>(
        database, sql`SELECT p.id AS id, ${performanceSoldColumn('p', references)} AS soldTickets FROM performances p`,
      )
      expect(listed[0]?.soldTickets).toBe(2)
    })
  })

  test('a show sums the seats its performances hold', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 10 })
      database.batch([['INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
        'performance-second', seeded.showId, seeded.venueId, seeded.startsAt + 86_400, 'ON_SALE']])

      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, reserve(database, 'r-1', seeded.performanceId))], null))
      run(database, ticketInsertQueries([ticket('t-2', 'performance-second', reserve(database, 'r-2', 'performance-second'))], null))

      const summed = read<{ soldTickets: number }>(
        database, sql`SELECT ${showSoldColumn('s', [TICKETS_HOLD_SEATS])} AS soldTickets FROM shows s WHERE s.id = ${seeded.showId}`,
      )
      expect(summed[0]?.soldTickets).toBe(2)
    })
  })

  test('a show with no performances sums to nought rather than to nothing', async () => {
    await withDatabase((database) => {
      database.batch([['INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)', 's-empty', 'empty', 'Empty', 'DRAFT']])
      const summed = read<{ soldTickets: number }>(
        database, sql`SELECT ${showSoldColumn('s', [TICKETS_HOLD_SEATS])} AS soldTickets FROM shows s WHERE s.id = 's-empty'`,
      )
      expect(summed[0]?.soldTickets).toBe(0)
    })
  })
})

describe('lowering capacity rides the update that lowers it (D-105 criterion 4)', () => {
  test('the predicate refuses a lowering that a concurrent booking has just made impossible', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 10 })
      const reservation = reserve(database, 'r-1', seeded.performanceId)
      run(database, ticketInsertQueries(
        [1, 2, 3].map(n => ticket(`t-${n}`, seeded.performanceId, reservation)),
        null,
      ))

      // Passed explicitly: the live registry has nothing classified sold until D-104 registers
      // `tickets`, so the predicate would otherwise see nothing held at all (D-105).
      const references = [TICKETS_HOLD_SEATS]

      const [query, ...parameters] = boundStatement(database, loweringPredicate(seeded.performanceId, 2, references))
      expect(rows<{ ok: number }>(database, `SELECT CASE WHEN ${query} THEN 1 ELSE 0 END AS ok`, ...parameters)[0]?.ok).toBe(0)

      const [allowed, ...allowedParameters] = boundStatement(database, loweringPredicate(seeded.performanceId, 3, references))
      expect(rows<{ ok: number }>(database, `SELECT CASE WHEN ${allowed} THEN 1 ELSE 0 END AS ok`, ...allowedParameters)[0]?.ok).toBe(1)
    })
  })

  // The live route calls this with no third argument, and `tickets` is not a table yet: the
  // default must stay registry-gated, or every performance edit 500s until D-104 lands.
  test('against the live schema, with neither tickets nor reservations built, the default still runs', async () => {
    const database = await createTestDatabase()
    try {
      const seeded = tonightsPerformance(database, { capacityOverride: 10 })
      const [query, ...parameters] = boundStatement(database, loweringPredicate(seeded.performanceId, 0))
      expect(rows<{ ok: number }>(database, `SELECT CASE WHEN ${query} THEN 1 ELSE 0 END AS ok`, ...parameters)[0]?.ok).toBe(1)
    }
    finally {
      database.close()
    }
  })
})
