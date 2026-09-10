import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import {
  TICKETS_HOLD_SEATS,
  capacityAllows,
  heldSeatsColumn,
  heldSeatsQuery,
  loweringPredicate,
  reservationIsPending,
  ticketAdditionQueries,
  ticketInsertQueries,
  ticketRemovalQueries,
} from '#server/utils/capacity'
import { performanceSoldColumn, performanceSoldQuery, showSoldColumn } from '#server/utils/programme'
import { reinstateReservationStatement } from '#server/utils/reservations'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import { expectOneWinner, race } from '#tests/helpers/race'
import type { TicketToWrite } from '#server/utils/capacity'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-105 against the real rule, over the real `tickets` and `reservations` tables D-104 migrated.
// The contended case is the named race in races-capacity.test.ts.

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

      run(database, [reinstateReservationStatement(reservation, seeded.performanceId, 2, 1, 1_800_000_000)])

      expect(heldSeats(database, seeded.performanceId)).toBe(1)
      const status = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', reservation)
      expect(status[0]?.status).toBe('PENDING')
    })
  })

  test('reinstating over a resold seat writes nothing (criterion 1, criterion 3)', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 1 })
      const lapsed = reserve(database, 'r-1', seeded.performanceId, 'EXPIRED')
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, lapsed)], null))

      const resold = reserve(database, 'r-2', seeded.performanceId)
      run(database, ticketInsertQueries([ticket('t-2', seeded.performanceId, resold)], 1))
      expect(heldSeats(database, seeded.performanceId)).toBe(1)

      run(database, [reinstateReservationStatement(lapsed, seeded.performanceId, 1, 1, 1_800_000_000)])

      const status = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', lapsed)
      expect(status[0]?.status).toBe('EXPIRED')
      expect(heldSeats(database, seeded.performanceId)).toBe(1)
    })
  })

  test('a customer\'s own cancellation reinstates', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 1 })
      const cancelled = reserve(database, 'r-1', seeded.performanceId, 'CANCELLED')
      database.batch([['UPDATE reservations SET cancelled_by = ? WHERE id = ?', 'CUSTOMER', cancelled]])
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, cancelled)], null))

      run(database, [reinstateReservationStatement(cancelled, seeded.performanceId, 1, 1, 1_800_000_000)])

      const status = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', cancelled)
      expect(status[0]?.status).toBe('PENDING')
    })
  })

  // D-116 criterion 5: a staff cancellation only ever follows a refund, so it is never a hold
  // this path brings back, whatever the house's capacity.
  test('a staff cancellation never reinstates, even with room to spare', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 10 })
      const cancelled = reserve(database, 'r-1', seeded.performanceId, 'CANCELLED')
      database.batch([['UPDATE reservations SET cancelled_by = ? WHERE id = ?', 'STAFF', cancelled]])
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, cancelled)], null))

      run(database, [reinstateReservationStatement(cancelled, seeded.performanceId, 10, 1, 1_800_000_000)])

      const status = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', cancelled)
      expect(status[0]?.status).toBe('CANCELLED')
    })
  })

  // The named race (0003): reinstating the lapsed hold and a fresh order both chase the one
  // seat it freed, fired together so an in-process SQLite still proves exactly one winner.
  test('reinstating races a fresh order for the same freed seat: exactly one wins', async () => {
    await withDatabase(async (database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 1 })
      const lapsed = reserve(database, 'r-1', seeded.performanceId, 'EXPIRED')
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, lapsed)], null))

      const fresh = reserve(database, 'r-2', seeded.performanceId, 'PENDING')

      const answers = await race(2, async (index) => {
        if (index === 0) {
          run(database, [reinstateReservationStatement(lapsed, seeded.performanceId, 1, 1, 1_800_000_000)])
          const status = rows<{ status: string }>(database, 'SELECT status FROM reservations WHERE id = ?', lapsed)
          return { status: status[0]?.status === 'PENDING' ? 200 : 409 }
        }
        run(database, ticketInsertQueries([ticket('t-2', seeded.performanceId, fresh)], 1))
        const held = rows<{ n: number }>(database, 'SELECT count(*) n FROM tickets WHERE reservation_id = ?', fresh)[0]?.n ?? 0
        return { status: held === 1 ? 200 : 409 }
      })

      expectOneWinner(answers)
      expect(heldSeats(database, seeded.performanceId)).toBe(1)
    })
  })
})

// The registry row D-104 pushed: `TICKETS_HOLD_SEATS` passed explicitly here proves the shape
// regardless of whatever else the live `PERFORMANCE_REFERENCES` default carries.
describe('the row D-104 pushed already counts seats correctly (D-105)', () => {
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

  // The live route calls this with no third argument: the default now reads the live registry,
  // which D-104 classified, and against an empty house correctly finds nothing held.
  test('against the live schema, with tickets and reservations built and nothing sold, the default still runs', async () => {
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

describe('D-110: an edit\'s additions and removals share one guard (criterion 2)', () => {
  test('a mixed add-and-remove request applies in full when capacity allows it', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 5 })
      const reservation = reserve(database, 'r-1', seeded.performanceId)
      run(database, ticketInsertQueries([
        ticket('t-1', seeded.performanceId, reservation),
        ticket('t-2', seeded.performanceId, reservation),
      ], null))

      // Desired: drop to 1 standard, i.e. one removal and no addition, still guarded identically.
      const guard = sql`${capacityAllows(seeded.performanceId, 5, 1, reservation)} AND ${reservationIsPending(reservation)}`
      run(database, ticketRemovalQueries(reservation, [{ ticketTypeId: 'tt-standard', quantity: 1 }], guard))

      expect(heldSeats(database, seeded.performanceId)).toBe(1)
    })
  })

  test('an increase with no room refuses the whole request, removals included', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 3 })
      const first = reserve(database, 'r-1', seeded.performanceId)
      run(database, ticketInsertQueries([ticket('t-1', seeded.performanceId, first)], 3))
      const editing = reserve(database, 'r-2', seeded.performanceId)
      run(database, ticketInsertQueries([
        ticket('t-2', seeded.performanceId, editing),
        ticket('t-3', seeded.performanceId, editing),
      ], 3))
      expect(heldSeats(database, seeded.performanceId)).toBe(3)

      // r-2 wants to go from 2 to 3 (short by one, since r-1 already holds the house's last seat):
      // the desired total of 3 is what the guard is asked against, not the delta of 1.
      const guard = sql`${capacityAllows(seeded.performanceId, 3, 3, editing)} AND ${reservationIsPending(editing)}`
      run(database, ticketAdditionQueries([ticket('t-4', seeded.performanceId, editing)], guard))

      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets WHERE id = ?', 't-4')).toEqual([])
      expect(heldSeats(database, seeded.performanceId)).toBe(3)
    })
  })

  test('a reservation no longer PENDING refuses every statement sharing its guard', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 5 })
      const reservation = reserve(database, 'r-1', seeded.performanceId, 'COLLECTED')

      const guard = sql`${capacityAllows(seeded.performanceId, 5, 1, reservation)} AND ${reservationIsPending(reservation)}`
      run(database, ticketAdditionQueries([ticket('t-1', seeded.performanceId, reservation)], guard))

      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets')).toEqual([])
    })
  })

  test('a removal names no particular row: any unrefunded ticket of that type goes', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { capacityOverride: 5 })
      const reservation = reserve(database, 'r-1', seeded.performanceId)
      run(database, ticketInsertQueries([
        ticket('t-1', seeded.performanceId, reservation),
        ticket('t-2', seeded.performanceId, reservation),
        ticket('t-3', seeded.performanceId, reservation),
      ], null))

      const guard = sql`${capacityAllows(seeded.performanceId, 5, 2, reservation)} AND ${reservationIsPending(reservation)}`
      run(database, ticketRemovalQueries(reservation, [{ ticketTypeId: 'tt-standard', quantity: 1 }], guard))

      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets')).toHaveLength(2)
    })
  })

  test('no statement binds a parameter per row removed', async () => {
    await withDatabase((database) => {
      const guard = sql`1 = 1`
      for (const statement of ticketRemovalQueries('r-1', [{ ticketTypeId: 'tt-standard', quantity: 200 }], guard)) {
        const [, ...parameters] = boundStatement(database, statement)
        expect(parameters.length).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
      }
    })
  })
})
