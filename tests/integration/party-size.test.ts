import { describe, expect, test } from 'bun:test'
import { doorPartyQuery } from '#server/utils/door'
import { accessBookingsQuery } from '#server/utils/tonight-glance'
import { tillBookingByIdQuery } from '#server/utils/till-bookings'
import {
  admittedSeatsSubquery,
  heldAccessSeatsSubquery,
  heldSeatsOfKindSubquery,
  heldSeatsSubquery,
  ticketInsertQueries,
  unpaidSeatsSubquery,
  walkUpSeatsSubquery,
} from '#server/utils/capacity'
import { boundStatement, createTestDatabase, rows, sql } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// A booking's party is its own held seats, never the house's (#1295): the door verdict (E-129
// criterion 7), the till's found booking (F-122 criterion 2) and the glance's access list (E-112).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    ticketTypeFixture(database)
    database.batch([['INSERT INTO ticket_types (id, name, price, kind, access_kind) VALUES (?, ?, ?, ?, ?)',
      'tt-access', 'Access', 900, 'SINGLE', 'ACCESS']])
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

function booking(database: TestDatabase, id: string, performanceId: string, name: string, seats: number, status: string): void {
  const tickets = Array.from({ length: seats }, (_, seat) => ticketInsertQueries([{
    id: `${id}-t${seat}`,
    reservationId: id,
    performanceId,
    ticketTypeId: seat === 0 ? 'tt-access' : 'tt-standard',
    pricePaid: 900,
    priceSource: 'BASE',
  }], null)).flat()
  database.batch([
    ['INSERT INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', `u-${id}`, name, `${id}@e2e.newtheatre.org.uk`],
    ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
      id, id.toUpperCase(), performanceId, `u-${id}`, status, 'WEB'],
    ...tickets.map(statement => boundStatement(database, statement)),
  ])
}

// Two bookings of different sizes and one lapsed hold, so a count that escapes its own booking
// reads 3 (or 5 with the lapsed seats) rather than the booking's own figure.
function tonightsHouse(database: TestDatabase): string {
  const { performanceId } = tonightsPerformance(database)
  booking(database, 'rpair', performanceId, 'Mira Pair', 2, 'PENDING')
  booking(database, 'rsolo', performanceId, 'Sol Single', 1, 'COLLECTED')
  booking(database, 'rgone', performanceId, 'Lapsed Hold', 2, 'EXPIRED')
  return performanceId
}

describe('each booking counts its own seats as its party (#1295)', () => {
  test.each([
    ['the door verdict (E-129 criterion 7)', doorPartyQuery],
    ['the till\'s found booking (F-122 criterion 2)', tillBookingByIdQuery],
  ] as const)('%s reads 2, 1 and 0', async (_, query) => {
    await withDatabase((database) => {
      tonightsHouse(database)
      const party = (id: string) => read<{ partySize: number }>(database, query(id))[0]?.partySize
      expect(party('rpair')).toBe(2)
      expect(party('rsolo')).toBe(1)
      expect(party('rgone')).toBe(0)
    })
  })

  test('the glance\'s access list gives each booking its own party (E-112 criterion 6)', async () => {
    await withDatabase((database) => {
      const performanceId = tonightsHouse(database)
      expect(read(database, accessBookingsQuery(performanceId)))
        .toMatchObject([{ name: 'Mira Pair', party: 2 }, { name: 'Sol Single', party: 1 }])
    })
  })
})

// The bug #1295 fixed in one count lived in its siblings too: a caller correlating through its own
// `r` or `t` was captured by the subquery's. Correlated or bound, every house count now agrees.
describe('the house counts ignore a caller\'s own aliases (#1295)', () => {
  const COUNTS: [string, (performanceId: SQL) => SQL][] = [
    ['held', performanceId => heldSeatsSubquery(performanceId)],
    ['unpaid', unpaidSeatsSubquery],
    ['admitted', admittedSeatsSubquery],
    ['walk-up', walkUpSeatsSubquery],
    ['held of a kind', performanceId => heldSeatsOfKindSubquery(performanceId, 'SINGLE')],
    ['held for access', heldAccessSeatsSubquery],
  ]

  // A second house with seats of every sort, so a count that escapes its correlation reads them.
  function secondHouse(database: TestDatabase): void {
    const { performanceId } = tonightsPerformance(database, { suffix: 'other' })
    booking(database, 'rother', performanceId, 'Otto Other', 4, 'PENDING')
    booking(database, 'rdoor', performanceId, 'Dora Door', 1, 'DOOR')
    database.batch([['UPDATE reservations SET source = ? WHERE id = ?', 'DOOR', 'rdoor']])
  }

  test.each(COUNTS)('%s: through the caller\'s r or t, the same as bound to the performance', async (_, count) => {
    await withDatabase((database) => {
      const performanceId = tonightsHouse(database)
      secondHouse(database)
      const [bound] = read<{ n: number }>(database, sql`SELECT ${count(sql`${performanceId}`)} AS n`)
      const [viaR] = read<{ n: number }>(database, sql`SELECT ${count(sql`r.performance_id`)} AS n FROM reservations r WHERE r.id = 'rpair'`)
      const [viaT] = read<{ n: number }>(database, sql`SELECT ${count(sql`t.performance_id`)} AS n FROM tickets t WHERE t.id = 'rsolo-t0'`)
      expect(viaR!.n).toBe(bound!.n)
      expect(viaT!.n).toBe(bound!.n)
    })
  })
})
