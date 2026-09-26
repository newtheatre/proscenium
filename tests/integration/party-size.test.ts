import { describe, expect, test } from 'bun:test'
import { doorPartyQuery } from '#server/utils/door'
import { accessBookingsQuery } from '#server/utils/tonight-glance'
import { tillBookingByIdQuery } from '#server/utils/till-bookings'
import { ticketInsertQueries } from '#server/utils/capacity'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
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
