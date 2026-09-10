import { describe, expect, test } from 'bun:test'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { showsList } from '#shared/utils/shows-list'
import {
  PERFORMANCE_REFERENCES,
  cascadeOnSaleQuery,
  performanceSoldQuery,
  showPerformancesQuery,
  showsClause,
  showsQuery,
} from '#server/utils/programme'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { PerformanceReference } from '#server/utils/programme'
import type { TestDatabase } from '#tests/helpers/database'

// D-121 and D-112 on the real migrations. "Has sold tickets" is what criterion 5 turns on, and it
// is a question about rows in other tables rather than a flag on the performance.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: ReturnType<typeof cascadeOnSaleQuery>): void {
  const [query, ...parameters] = boundStatement(database, statement)
  database.raw.prepare(query).run(...parameters as never[])
}

function read<T>(database: TestDatabase, statement: ReturnType<typeof showsQuery>): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

function statuses(database: TestDatabase, showId: string): string[] {
  return rows<{ id: string, status: string }>(
    database, 'SELECT id, status FROM performances WHERE show_id = ? ORDER BY id', showId,
  ).map(row => `${row.id}:${row.status}`)
}

// What D-104 will add, stood up here so the predicate can be proved against rows that do not
// exist yet.
const FUTURE_TICKETS: PerformanceReference = {
  table: 'future_tickets',
  column: 'performance_id',
  sold: true,
  why: 'a stand-in for the tickets table, for proving the count reads rows',
}

function withFutureTickets(database: TestDatabase): void {
  database.raw.exec(`
    CREATE TABLE future_tickets (
      id text PRIMARY KEY,
      performance_id text NOT NULL REFERENCES performances(id)
    )
  `)
}

function sellTicket(database: TestDatabase, id: string, performanceId: string): void {
  database.batch([['INSERT INTO future_tickets (id, performance_id) VALUES (?, ?)', id, performanceId]])
}

describe('a show and its performances carry a booking window at both levels (D-112 criterion 1)', () => {
  test('the show carries a default and the performance an override, both nullable', async () => {
    await withDatabase((database) => {
      const columns = (table: string): string[] =>
        rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('${table}')`).map(column => column.name)
      expect(columns('shows')).toContain('booking_closes_hours_before')
      expect(columns('performances')).toContain('booking_closes_hours_before')
    })
  })

  // The console reads the window from the same row it reads the status from, so a screen never
  // has to join the show back to answer whether booking is open.
  test('the show listing and the performance listing each carry the window', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { bookingClosesHoursBefore: 3 })
      database.batch([['UPDATE shows SET booking_closes_hours_before = ? WHERE id = ?', 2, seeded.showId]])

      const [show] = read<{ bookingClosesHoursBefore: number }>(database, showsQuery({}, 25, 0))
      expect(show?.bookingClosesHoursBefore).toBe(2)

      const [performance] = read<{ bookingClosesHoursBefore: number }>(database, showPerformancesQuery(seeded.showId))
      expect(performance?.bookingClosesHoursBefore).toBe(3)
    })
  })
})

describe('publishing cascades to draft performances only (D-121 criterion 2)', () => {
  test('draft performances go on sale and cancelled ones are skipped', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { status: 'DRAFT', showStatus: 'DRAFT' })
      database.batch([
        ['INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
          'performance-cancelled', seeded.showId, seeded.venueId, seeded.startsAt + 86_400, 'CANCELLED'],
        ['INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
          'performance-selling', seeded.showId, seeded.venueId, seeded.startsAt + 172_800, 'ON_SALE'],
      ])

      run(database, cascadeOnSaleQuery(seeded.showId))

      expect(statuses(database, seeded.showId)).toEqual([
        'performance-a:ON_SALE',
        'performance-cancelled:CANCELLED',
        'performance-selling:ON_SALE',
      ])
    })
  })

  // One statement binding the show id alone, so a show with forty performances runs the same
  // query as a show with one (0003, 0006).
  test('the cascade binds one parameter however many performances the show has', async () => {
    await withDatabase((database) => {
      const [statement, ...parameters] = boundStatement(database, cascadeOnSaleQuery('show-a'))
      expect(parameters).toEqual(['show-a'])
      expect(statement).not.toContain(' IN (')
    })
  })

  test('the cascade never reaches another show\'s performances', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database, { status: 'DRAFT' })
      const second = tonightsPerformance(database, { suffix: 'b', status: 'DRAFT' })

      run(database, cascadeOnSaleQuery(first.showId))

      expect(statuses(database, first.showId)).toEqual(['performance-a:ON_SALE'])
      expect(statuses(database, second.showId)).toEqual(['performance-b:DRAFT'])
    })
  })
})

describe('unpublishing closes sales and touches nothing sold (D-121 criterion 4)', () => {
  test('the performances keep their status, so republishing restores the same programme', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database, { showStatus: 'PUBLISHED', status: 'ON_SALE' })
      withFutureTickets(database)
      sellTicket(database, 'ticket-1', seeded.performanceId)

      database.batch([['UPDATE shows SET status = ? WHERE id = ?', 'DRAFT', seeded.showId]])

      expect(statuses(database, seeded.showId)).toEqual(['performance-a:ON_SALE'])
      expect(rows<{ total: number }>(database, 'SELECT count(*) AS total FROM future_tickets')[0]?.total).toBe(1)
    })
  })
})

describe('"has sold tickets" is a count over rows, never a flag (D-121 criterion 5)', () => {
  // A flag is a thing somebody forgets to set, and the performance is then deletable with tickets
  // against it. The registry below is what the count reads instead.
  test('neither table carries a column that could stand in for the count', async () => {
    await withDatabase((database) => {
      for (const table of ['performances', 'shows']) {
        const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('${table}')`)
          .map(column => column.name)
        expect(columns.filter(name => /sold|tickets|refund/.test(name))).toEqual([])
      }
    })
  })

  // The one that fails when D-104 lands: a new table pointing at performances holds seats or it
  // does not, and somebody has to say which before it merges.
  test('every table pointing at performances is classified in the registry', async () => {
    await withDatabase((database) => {
      const tables = rows<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      const pointing: string[] = []
      for (const { name } of tables) {
        const keys = rows<{ table: string, from: string }>(database, `PRAGMA foreign_key_list('${name}')`)
        for (const key of keys) {
          if (key.table === 'performances') pointing.push(`${name}.${key.from}`)
        }
      }
      const declared = PERFORMANCE_REFERENCES.map(reference => `${reference.table}.${reference.column}`)
      expect(pointing.sort()).toEqual(declared.sort())
    })
  })

  test('a price override is configuration, so a performance with one has sold nothing', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([
        ['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-1', 'Standard', 700, 'SINGLE'],
        ['INSERT INTO performance_ticket_overrides (id, performance_id, ticket_type_id, price) VALUES (?, ?, ?, ?)',
          'o1', seeded.performanceId, 'tt-1', 500],
      ])

      // A price override is not a sale, whatever else the registry now classifies (D-104).
      const [counted] = read<{ sold: number }>(database, performanceSoldQuery(seeded.performanceId))
      expect(counted?.sold).toBe(0)
    })
  })

  test('a sold table with rows against the performance is counted', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const other = tonightsPerformance(database, { suffix: 'b' })
      withFutureTickets(database)
      sellTicket(database, 'ticket-1', seeded.performanceId)
      sellTicket(database, 'ticket-2', seeded.performanceId)
      sellTicket(database, 'ticket-3', other.performanceId)

      const references = [FUTURE_TICKETS]
      const [counted] = read<{ sold: number }>(database, performanceSoldQuery(seeded.performanceId, references))
      expect(counted?.sold).toBe(2)

      const listed = read<{ id: string, soldTickets: number }>(database, showPerformancesQuery(seeded.showId, references))
      expect(listed.map(row => row.soldTickets)).toEqual([2])
    })
  })

  // A show's count reaches its tickets through its performances by subquery, never by reading a
  // list of performance ids back and binding them (0006).
  test('a show counts what its performances have sold, and binds one parameter', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      withFutureTickets(database)
      sellTicket(database, 'ticket-1', seeded.performanceId)

      const [statement, ...parameters] = boundStatement(database, showsQuery({}, 25, 0))
      expect(parameters).toEqual([25, 0])
      // 0006 forbids an IN list built from a result set; `tickets`' own fixed, literal status
      // enum is not one, so the check is for a bound-parameter IN list specifically (0003).
      expect(statement).not.toContain(' IN (?')

      const counted = read<{ id: string, soldTickets: number }>(database, showsQuery({}, 25, 0, [FUTURE_TICKETS]))
      expect(counted.find(row => row.id === seeded.showId)?.soldTickets).toBe(1)
    })
  })
})

// The shows list through its declaration (K-129 criteria 1 and 5): a season is a column and
// "unassessed" and "on sale" are questions about other rows, all answered by one clause.
describe('the shows list filters by its declaration (K-129)', () => {
  const schema = filterQuerySchema(showsList)
  const parsed = (raw: Record<string, string>) => {
    const result = schema.safeParse(raw)
    if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
    return result.data
  }
  const listed = (database: TestDatabase, raw: Record<string, string>): string[] =>
    read<{ id: string }>(database, showsQuery(showsClause(parsed(raw)), 25, 0)).map(row => row.id)

  function seedSeasons(database: TestDatabase): void {
    tonightsPerformance(database, { showStatus: 'PUBLISHED', status: 'ON_SALE' })
    tonightsPerformance(database, { suffix: 'b', showStatus: 'DRAFT', status: 'DRAFT' })
    database.batch([
      ['INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', 'season-autumn', 'Autumn', '2026-09-20', '2026-12-10'],
      ['INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', 'season-spring', 'Spring', '2027-01-20', '2027-04-10'],
      ['INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)', 'show-c', 'no-season', 'Unplaced', 'DRAFT'],
      ['UPDATE shows SET season_id = ? WHERE id = ?', 'season-autumn', 'show-a'],
      ['UPDATE shows SET season_id = ? WHERE id = ?', 'season-spring', 'show-b'],
    ])
  }

  test('a season is, is not, is any of and is empty', async () => {
    await withDatabase((database) => {
      seedSeasons(database)
      expect(listed(database, { seasonId: 'is:season-autumn' })).toEqual(['show-a'])
      expect(listed(database, { seasonId: 'any:season-autumn,season-spring' })).toEqual(['show-b', 'show-a'])
      expect(listed(database, { seasonId: 'empty' })).toEqual(['show-c'])
      expect(listed(database, { seasonId: 'not:season-autumn' })).toEqual(['show-b', 'show-c'])
    })
  })

  test('unassessed and on sale are answered from other rows, and combine with a season by AND', async () => {
    await withDatabase((database) => {
      seedSeasons(database)
      expect(listed(database, { unassessed: 'true' })).toEqual(['show-a'])
      expect(listed(database, { onSale: 'true' })).toEqual(['show-a'])
      expect(listed(database, { onSale: 'false' })).toEqual(['show-b', 'show-c'])
      expect(listed(database, { onSale: 'true', seasonId: 'is:season-spring' })).toEqual([])
      expect(listed(database, { status: 'is:DRAFT', search: 'test' })).toEqual(['show-b'])
    })
  })

  test('a season list past its cap is refused before any statement is built', async () => {
    await withDatabase(() => {
      const cap = showsList.fields.find(field => field.key === 'seasonId')!.cap!
      const many = Array.from({ length: cap + 1 }, (_, index) => `season-${index}`)
      expect(schema.safeParse({ seasonId: `any:${many.slice(0, cap).join(',')}` }).success).toBe(true)
      expect(schema.safeParse({ seasonId: `any:${many.join(',')}` }).success).toBe(false)
    })
  })

  test('the sort is a declared field and the default order is status then title', async () => {
    await withDatabase((database) => {
      seedSeasons(database)
      expect(listed(database, {})).toEqual(['show-b', 'show-c', 'show-a'])
      expect(listed(database, { sort: 'title', direction: 'desc' })).toEqual(['show-c', 'show-b', 'show-a'])
      expect(schema.safeParse({ sort: 'slug' }).success).toBe(false)
    })
  })
})
