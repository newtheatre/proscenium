import { describe, expect, test } from 'bun:test'
import { TICKETS_HOLD_SEATS } from '#server/utils/capacity'
import { fellowshipAdmittedSeatsSubquery, passAdmittedSeatsSubquery } from '#server/utils/night-report'
import { performanceSoldColumn, showSoldColumn } from '#server/utils/programme'
import { boundStatement, createTestDatabase, rows, sql } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { PerformanceReference } from '#server/utils/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// A count correlated into a caller's query aliases its own tables privately, so a caller whose own
// alias matches one of them still reads its own house and not every house (0006, #1464's rule).

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

function read(database: TestDatabase, statement: SQL): number {
  const [query, ...parameters] = boundStatement(database, statement)
  return Number(rows<{ n: number }>(database, query, ...parameters)[0]?.n ?? -1)
}

// Two houses side by side, each with its own booking at the door and a seat per pass admission,
// the second house holding more of everything so a count that reads both is caught.
function twoHouses(database: TestDatabase): { mine: ReturnType<typeof tonightsPerformance>, other: ReturnType<typeof tonightsPerformance> } {
  const mine = tonightsPerformance(database, { suffix: 'mine' })
  const other = tonightsPerformance(database, { suffix: 'other' })
  database.batch([
    ['INSERT INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', 'holder', 'Pass holder', 'holder@e2e.newtheatre.org.uk'],
    ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)', 'pt-season', 'season', 'Season pass', 1_000, 2_000],
    ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', 'price-season', 'pt-season', 'Standard'],
    ['INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)', 'pt-fellowship', 'fellowship', 'Fellowship', 1_000, 2_000],
    ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', 'price-fellowship', 'pt-fellowship', 'Fellow'],
  ])
  const house = (key: string, performanceId: string, season: number): void => {
    database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
      `r-${key}`, `REF${key.toUpperCase().slice(0, 3)}`, performanceId, 'DOOR', 'WEB']])
    const passes: [string, string][] = [...Array.from({ length: season }, () => ['pt-season', 'price-season'] as [string, string]), ['pt-fellowship', 'price-fellowship']]
    passes.forEach(([typeId, priceId], index) => {
      database.batch([
        ['INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, 0, ?)',
          `t-${key}-${index}`, `r-${key}`, performanceId, 'tt-standard', 'BASE'],
        ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, issued_by) VALUES (?, ?, ?, ?, ?, 0, ?)',
          `pass-${key}-${index}`, `P${key.toUpperCase().slice(0, 3)}${index}`, typeId, priceId, 'holder', 'holder'],
        ['INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id) VALUES (?, ?, ?, ?)',
          `admission-${key}-${index}`, `pass-${key}-${index}`, performanceId, `t-${key}-${index}`],
      ])
    })
  }
  house('mine', mine.performanceId, 1)
  house('other', other.performanceId, 2)
  return { mine, other }
}

describe('the night report\'s pass counts read only the caller\'s house (E-123, D-126)', () => {
  const COUNTS: [string, (performanceId: SQL) => SQL, number][] = [
    ['pass admissions', passAdmittedSeatsSubquery, 2],
    ['Fellowship admissions', fellowshipAdmittedSeatsSubquery, 1],
  ]

  test.each(COUNTS)('%s: bound, and through a caller\'s own r, t, a or p', async (_, count, expected) => {
    await withDatabase((database) => {
      const { mine } = twoHouses(database)
      expect(read(database, sql`SELECT ${count(sql`${mine.performanceId}`)} AS n`)).toBe(expected)
      expect(read(database, sql`SELECT ${count(sql`r.performance_id`)} AS n FROM reservations r WHERE r.id = 'r-mine'`)).toBe(expected)
      expect(read(database, sql`SELECT ${count(sql`t.performance_id`)} AS n FROM tickets t WHERE t.id = 't-mine-0'`)).toBe(expected)
      expect(read(database, sql`SELECT ${count(sql`a.performance_id`)} AS n FROM pass_admissions a WHERE a.id = 'admission-mine-0'`)).toBe(expected)
      expect(read(database, sql`SELECT ${count(sql`p.id`)} AS n FROM performances p WHERE p.id = ${mine.performanceId}`)).toBe(expected)
    })
  })
})

describe('the programme\'s sold counts read only the caller\'s show (D-121, 0006)', () => {
  test('a show\'s sold seats, through a caller aliasing its shows as the count\'s performances were', async () => {
    await withDatabase((database) => {
      const { mine, other } = twoHouses(database)
      expect(read(database, sql`SELECT ${showSoldColumn('s', [TICKETS_HOLD_SEATS])} AS n FROM shows s WHERE s.id = ${mine.showId}`)).toBe(2)
      expect(read(database, sql`SELECT ${showSoldColumn('sp', [TICKETS_HOLD_SEATS])} AS n FROM shows sp WHERE sp.id = ${mine.showId}`)).toBe(2)
      expect(read(database, sql`SELECT ${showSoldColumn('sp', [TICKETS_HOLD_SEATS])} AS n FROM shows sp WHERE sp.id = ${other.showId}`)).toBe(3)
    })
  })

  // A table that holds seats and says nothing of how is counted by its rows (D-121).
  test('a bare-counted reference, through a caller whose alias is that table\'s own name', async () => {
    await withDatabase((database) => {
      const { mine } = twoHouses(database)
      const bare: PerformanceReference = { table: 'tickets', column: 'performance_id', sold: true, why: 'a seat, counted by its rows' }
      expect(read(database, sql`SELECT ${performanceSoldColumn('p', [bare])} AS n FROM performances p WHERE p.id = ${mine.performanceId}`)).toBe(2)
      expect(read(database, sql`SELECT ${performanceSoldColumn('tickets', [bare])} AS n FROM performances tickets WHERE tickets.id = ${mine.performanceId}`)).toBe(2)
    })
  })
})
