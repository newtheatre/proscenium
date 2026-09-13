import { describe, expect, test } from 'bun:test'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { seasonsList } from '#shared/utils/seasons-list'
import { SEASON_REFERENCES, seasonInUseQuery, seasonsClause, seasonsQuery } from '#server/utils/seasons'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// K-129: the declaration is what turns a raw query into a clause, the same route it takes live.
const seasonsSchema = filterQuerySchema(seasonsList)
function parsedSeasons(raw: Record<string, string>) {
  const result = seasonsSchema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return seasonsClause(result.data)
}

// D-131. A show belongs to at most one season, and "in use" is a query over that reference
// rather than a flag on the season itself.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function season(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'se-1', name: '2026/27', starts_on: '2026-08-01', ends_on: '2027-07-31', ...over }
  insert(database, 'seasons', values)
  return String(values.id)
}

function inUse(database: TestDatabase, statement: ReturnType<typeof seasonInUseQuery>): boolean {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<{ inUse: number }>(database, query, ...parameters)[0]!.inUse === 1
}

describe('a season is uniquely named and carries a real window (criterion 2)', () => {
  test('the name is held once, whatever the capitals', async () => {
    await withDatabase((database) => {
      season(database)
      expect(() => season(database, { id: 'se-2', name: '2026/27' })).toThrow()
      expect(() => season(database, { id: 'se-3', name: '2026/27'.toUpperCase() })).toThrow()
      expect(() => season(database, { id: 'se-4', name: '2027/28', starts_on: '2027-08-01', ends_on: '2028-07-31' })).not.toThrow()
    })
  })

  test('a season ends after it starts', async () => {
    await withDatabase((database) => {
      expect(() => season(database, { starts_on: '2026-08-01', ends_on: '2026-07-31' })).toThrow()
      expect(() => season(database, { starts_on: '2026-08-01', ends_on: '2026-08-01' })).toThrow()
    })
  })
})

describe('"in use" is a query over rows, never a flag (criterion 4)', () => {
  test('every table pointing at seasons is declared in the registry', async () => {
    await withDatabase((database) => {
      const tables = rows<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      const pointing: string[] = []
      for (const { name } of tables) {
        const keys = rows<{ table: string, from: string }>(database, `PRAGMA foreign_key_list('${name}')`)
        for (const key of keys) {
          if (key.table === 'seasons') pointing.push(`${name}.${key.from}`)
        }
      }
      const declared = SEASON_REFERENCES.map(reference => `${reference.table}.${reference.column}`)
      expect(pointing.sort()).toEqual(declared.sort())
    })
  })

  test('a fresh season is not in use', async () => {
    await withDatabase((database) => {
      const id = season(database)
      expect(inUse(database, seasonInUseQuery(id))).toBe(false)
    })
  })

  test('a show flips it', async () => {
    await withDatabase((database) => {
      const id = season(database)
      insert(database, 'shows', { id: 's-1', slug: 'the-seagull', title: 'The Seagull', season_id: id })
      expect(inUse(database, seasonInUseQuery(id))).toBe(true)
    })
  })
})

describe('the listing is searched and paged in SQL', () => {
  test('the archived filter and the page window are the same question the count asks', async () => {
    await withDatabase((database) => {
      season(database)
      season(database, { id: 'se-2', name: '2027/28', starts_on: '2027-08-01', ends_on: '2028-07-31' })
      season(database, { id: 'se-3', name: 'Retired', starts_on: '2020-08-01', ends_on: '2021-07-31', archived: 1 })

      const [query, ...parameters] = boundStatement(database, seasonsQuery(parsedSeasons({ archived: 'false' }), 1, 1))
      expect(rows<{ id: string }>(database, query, ...parameters).map(row => row.id)).toEqual(['se-2'])
    })
  })
})
