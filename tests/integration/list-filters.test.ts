import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { fromLondonWallClock } from '#shared/utils/london'
import { aliasColumns, searchAcross, tableColumns, whereFrom } from '#server/utils/list-filters'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { ListSpec } from '#shared/utils/list-filters'
import type { ListClause } from '#server/utils/list-filters'
import type { TestDatabase } from '#tests/helpers/database'

// One helper turns a declaration and a validated query into predicates and an order clause
// (K-129 criterion 5), proved here against the real migrations rather than against strings.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

const people: ListSpec = {
  key: 'people',
  search: { placeholder: 'A name' },
  fields: [
    { key: 'verified', label: 'Verified', kind: 'yes-no', column: 'verified' },
    { key: 'lastLoginAt', label: 'Last seen', kind: 'date-range', column: 'last_login_at', dateAs: 'unix' },
    { key: 'initial', label: 'Initial', kind: 'list', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }], cap: 3 },
  ],
  sort: {
    fields: [
      { key: 'name', label: 'Name', column: 'name', collate: 'nocase' },
      { key: 'lastLoginAt', label: 'Last seen', column: 'last_login_at' },
    ],
    default: 'name',
  },
}

const programme: ListSpec = {
  key: 'programme',
  fields: [
    { key: 'status', label: 'Status', kind: 'list', column: 'status', options: [{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }] },
    { key: 'seasonId', label: 'Season', kind: 'search-list', column: 'season_id', cap: 4 },
    { key: 'startsOn', label: 'Starts', kind: 'date-range', column: 'starts_on' },
    { key: 'capacity', label: 'Capacity', kind: 'number-range', column: 'capacity' },
  ],
  sort: { fields: [{ key: 'title', label: 'Title', column: 'title', collate: 'nocase' }], default: 'title' },
}

function seedPeople(database: TestDatabase): void {
  const seen = (day: string): number => seconds(fromLondonWallClock(...day.split('-').map(Number) as [number, number, number], 12))
  database.batch([
    ['INSERT INTO users (id, email, name, verified, last_login_at) VALUES (?, ?, ?, ?, ?)', 'u-alice', 'alice@example.test', 'alice Ash', 1, seen('2026-03-01')],
    ['INSERT INTO users (id, email, name, verified, last_login_at) VALUES (?, ?, ?, ?, ?)', 'u-bob', 'bob@example.test', 'Bob Birch', 0, seen('2026-03-15')],
    ['INSERT INTO users (id, email, name, verified, last_login_at) VALUES (?, ?, ?, ?, ?)', 'u-cara', 'cara@example.test', 'Cara Cedar', 1, null],
    ['INSERT INTO users (id, email, name, verified, last_login_at) VALUES (?, ?, ?, ?, ?)', 'u-dan', 'dan_x@example.test', 'Dan 100% Dale', 1, seen('2026-04-01')],
  ])
}

function seedProgramme(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', 'season-1', 'Autumn', '2026-09-20', '2026-12-10'],
    ['INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', 'season-2', 'Spring', '2027-01-20', '2027-04-10'],
    ['INSERT INTO shows (id, slug, title, status, season_id) VALUES (?, ?, ?, ?, ?)', 'show-a', 'a', 'Zebra', 'PUBLISHED', 'season-1'],
    ['INSERT INTO shows (id, slug, title, status, season_id) VALUES (?, ?, ?, ?, ?)', 'show-b', 'b', 'apple', 'DRAFT', 'season-2'],
    ['INSERT INTO shows (id, slug, title, status, season_id) VALUES (?, ?, ?, ?, ?)', 'show-c', 'c', 'Mango', 'DRAFT', null],
    ['INSERT INTO venues (id, name, capacity) VALUES (?, ?, ?)', 'venue-small', 'Studio', 40],
    ['INSERT INTO venues (id, name, capacity) VALUES (?, ?, ?)', 'venue-big', 'Auditorium', 120],
    ['INSERT INTO venues (id, name, capacity) VALUES (?, ?, ?)', 'venue-unknown', 'Field', null],
  ])
}

const parsed = (spec: ListSpec, query: Record<string, string>) => {
  const result = filterQuerySchema(spec).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function select(database: TestDatabase, table: string, clause: ListClause, column = 'id'): string[] {
  const statement = sql`SELECT ${sql.raw(column)} AS value FROM ${sql.raw(table)}
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ value: string }>(database, text, ...parameters).map(row => row.value)
}

const usersBinding = {
  column: tableColumns(schema.users),
  search: [schema.users.name, schema.users.email],
  fields: {
    // A field that is not a column: the first letter of the name, answered by an expression.
    initial: (condition: { operator: string, values: string[] }) => {
      const letters = condition.values.map(value => sql`${value}`)
      if (condition.operator === 'is') return sql`upper(substr(${schema.users.name}, 1, 1)) = ${condition.values[0]}`
      if (condition.operator === 'not') return sql`upper(substr(${schema.users.name}, 1, 1)) <> ${condition.values[0]}`
      if (condition.operator === 'any') return sql`upper(substr(${schema.users.name}, 1, 1)) IN (${sql.join(letters, sql`, `)})`
      return sql`1 = 0`
    },
  },
}

describe('a yes or no and a date range on real columns', () => {
  test('a yes or no filters on the column', async () => {
    await withDatabase((database) => {
      seedPeople(database)
      expect(select(database, 'users', whereFrom(people, parsed(people, { verified: 'false' }), usersBinding))).toEqual(['u-bob'])
      expect(select(database, 'users', whereFrom(people, parsed(people, { verified: 'true' }), usersBinding))).toEqual(['u-alice', 'u-cara', 'u-dan'])
    })
  })

  test('a unix timestamp is compared against London days, and the day itself is inside the range', async () => {
    await withDatabase((database) => {
      seedPeople(database)
      const on = (query: Record<string, string>): string[] => select(database, 'users', whereFrom(people, parsed(people, query), usersBinding))
      expect(on({ lastLoginAt: 'before:2026-03-15' })).toEqual(['u-alice'])
      expect(on({ lastLoginAt: 'after:2026-03-15' })).toEqual(['u-dan'])
      expect(on({ lastLoginAt: 'is:2026-03-15' })).toEqual(['u-bob'])
      expect(on({ lastLoginAt: 'between:2026-03-01,2026-03-15' })).toEqual(['u-alice', 'u-bob'])
      expect(on({ lastLoginAt: 'empty' })).toEqual(['u-cara'])
    })
  })

  test('a day column compares as a day, and a number column as a number', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      const seasons = { column: tableColumns(schema.seasons) }
      const venues = { column: tableColumns(schema.venues) }
      const seasonSpec: ListSpec = { ...programme, sort: { fields: [{ key: 'name', label: 'Name', column: 'name' }], default: 'name' } }
      expect(select(database, 'seasons', whereFrom(seasonSpec, parsed(seasonSpec, { startsOn: 'after:2026-12-31' }), seasons))).toEqual(['season-2'])
      expect(select(database, 'seasons', whereFrom(seasonSpec, parsed(seasonSpec, { startsOn: 'between:2026-09-01,2026-09-30' }), seasons))).toEqual(['season-1'])
      expect(select(database, 'venues', whereFrom(seasonSpec, parsed(seasonSpec, { capacity: 'after:50' }), venues))).toEqual(['venue-big'])
      expect(select(database, 'venues', whereFrom(seasonSpec, parsed(seasonSpec, { capacity: 'between:40,120' }), venues))).toEqual(['venue-big', 'venue-small'])
      expect(select(database, 'venues', whereFrom(seasonSpec, parsed(seasonSpec, { capacity: 'empty' }), venues))).toEqual(['venue-unknown'])
    })
  })
})

describe('lists, on a column and off one', () => {
  test('is, is not, is any of and is empty on a column, through a raw-SQL alias', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      const binding = { column: aliasColumns('s') }
      const on = (query: Record<string, string>): string[] => {
        const clause = whereFrom(programme, parsed(programme, query), binding)
        return select(database, 'shows s', clause, 's.id')
      }
      expect(on({ seasonId: 'is:season-1' })).toEqual(['show-a'])
      // "Is not Autumn" includes a show in no season at all: a human means "not that one".
      expect(on({ seasonId: 'not:season-1' })).toEqual(['show-b', 'show-c'])
      expect(on({ seasonId: 'any:season-1,season-2' })).toEqual(['show-b', 'show-a'])
      expect(on({ seasonId: 'empty' })).toEqual(['show-c'])
      expect(on({ status: 'is:DRAFT', seasonId: 'any:season-1,season-2' })).toEqual(['show-b'])
    })
  })

  test('a field that is not a column is answered by the binding', async () => {
    await withDatabase((database) => {
      seedPeople(database)
      const on = (query: Record<string, string>): string[] => select(database, 'users', whereFrom(people, parsed(people, query), usersBinding))
      expect(on({ initial: 'is:B' })).toEqual(['u-bob'])
      expect(on({ initial: 'any:A,C' })).toEqual(['u-alice', 'u-cara'])
      expect(on({ initial: 'not:A', verified: 'true' })).toEqual(['u-cara', 'u-dan'])
    })
  })

  test('a field with neither a column nor a binding is refused rather than silently ignored', async () => {
    await withDatabase(() => {
      expect(() => whereFrom(people, parsed(people, { initial: 'is:B' }), { column: tableColumns(schema.users) })).toThrow(/initial/)
    })
  })
})

describe('the statement binds a fixed number of parameters (0006)', () => {
  test('an "is any of" at the cap binds exactly the cap, and the cap is the declaration\'s', async () => {
    await withDatabase((database) => {
      const clause = whereFrom(programme, parsed(programme, { seasonId: 'any:s1,s2,s3,s4' }), { column: aliasColumns('s') })
      const [, ...parameters] = boundStatement(database, clause.where!)
      expect(parameters).toEqual(['s1', 's2', 's3', 's4'])
    })
  })

  test('a list over the cap never reaches the helper, and the helper refuses one that does', async () => {
    await withDatabase(() => {
      expect(filterQuerySchema(programme).safeParse({ seasonId: 'any:s1,s2,s3,s4,s5' }).success).toBe(false)
      const condition = { seasonId: { key: 'seasonId', operator: 'any', values: ['s1', 's2', 's3', 's4', 's5'] } }
      expect(() => whereFrom(programme, { page: 1, pageSize: 25, search: undefined, sort: 'title', direction: 'asc', ...condition }, { column: aliasColumns('s') })).toThrow(/cap/)
    })
  })
})

describe('search runs over the columns the endpoint names', () => {
  test('case-insensitive, a wildcard character is literal, and the columns are the binding\'s', async () => {
    await withDatabase((database) => {
      seedPeople(database)
      const on = (search: string): string[] => select(database, 'users', whereFrom(people, parsed(people, { search }), usersBinding))
      expect(on('ALICE')).toEqual(['u-alice'])
      expect(on('Ash')).toEqual(['u-alice'])
      expect(on('example.test')).toEqual(['u-alice', 'u-bob', 'u-cara', 'u-dan'])
      expect(on('100%')).toEqual(['u-dan'])
      expect(on('_x')).toEqual(['u-dan'])
      expect(on('nobody')).toEqual([])
    })
  })

  test('the search fragment binds once per column', async () => {
    await withDatabase((database) => {
      const [, ...parameters] = boundStatement(database, searchAcross('ivy', [schema.users.name, schema.users.email, sql`coalesce(${schema.users.studentId}, '')`]))
      expect(parameters).toEqual(['%ivy%', '%ivy%', '%ivy%'])
    })
  })
})

describe('the order clause is the declared sort and its tiebreaks', () => {
  test('the default sort collates as declared and the direction flips it', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      const binding = { column: aliasColumns('s') }
      expect(select(database, 'shows s', whereFrom(programme, parsed(programme, {}), binding), 's.id')).toEqual(['show-b', 'show-c', 'show-a'])
      expect(select(database, 'shows s', whereFrom(programme, parsed(programme, { direction: 'desc' }), binding), 's.id')).toEqual(['show-a', 'show-c', 'show-b'])
    })
  })

  test('the remaining declared sorts follow as tiebreaks, so paging is deterministic', async () => {
    await withDatabase((database) => {
      seedPeople(database)
      const clause = whereFrom(people, parsed(people, { sort: 'lastLoginAt', direction: 'desc' }), usersBinding)
      const [text] = boundStatement(database, sql`${sql.join(clause.orderBy, sql`, `)}`)
      expect(text).toBe('"users"."last_login_at" desc, "users"."name" collate nocase asc')
      expect(select(database, 'users', clause)).toEqual(['u-dan', 'u-bob', 'u-alice', 'u-cara'])
    })
  })
})
