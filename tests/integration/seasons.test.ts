import { describe, expect, test } from 'bun:test'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { seasonsList } from '#shared/utils/seasons-list'
import { SEASON_REFERENCES, fillSeasonStatements, seasonInUseQuery, seasonOptionsQuery, seasonOverlapsQuery, seasonsClause, seasonsQuery } from '#server/utils/seasons'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

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

function ask<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

// Criterion 2, trimmed by issue 1352: the dates are the order, in the list and in every picker.
describe('seasons list in date order', () => {
  function threeSeasons(database: TestDatabase): void {
    season(database, { id: 'spring', name: 'Spring 2027', starts_on: '2027-01-20', ends_on: '2027-04-10' })
    season(database, { id: 'autumn', name: 'Autumn 2026', starts_on: '2026-09-20', ends_on: '2026-12-10' })
    season(database, { id: 'stuff', name: 'StuFF 2027', starts_on: '2027-05-01', ends_on: '2027-06-20', archived: 1 })
  }

  test('the console list opens earliest first, whatever the names say', async () => {
    await withDatabase((database) => {
      threeSeasons(database)
      expect(ask<{ id: string }>(database, seasonsQuery(parsedSeasons({}), 25, 0)).map(row => row.id)).toEqual(['autumn', 'spring', 'stuff'])
    })
  })

  test('a show\'s picker lists them the same way, a retired one included', async () => {
    await withDatabase((database) => {
      threeSeasons(database)
      expect(ask<{ id: string }>(database, seasonOptionsQuery()).map(row => row.id)).toEqual(['autumn', 'spring', 'stuff'])
    })
  })
})

// Guidance, not a constraint (0087): the save goes through and names what it overlaps.
describe('a save names the seasons it overlaps (issue 1352)', () => {
  function overlaps(database: TestDatabase, startsOn: string, endsOn: string, exceptId: string | null = null): string[] {
    return ask<{ name: string }>(database, seasonOverlapsQuery(startsOn, endsOn, exceptId)).map(row => row.name)
  }

  test('sharing even one day with a current season names it; the day after does not', async () => {
    await withDatabase((database) => {
      season(database, { id: 'autumn', name: 'Autumn 2026', starts_on: '2026-09-20', ends_on: '2026-12-10' })
      expect(overlaps(database, '2026-12-01', '2027-01-05')).toEqual(['Autumn 2026'])
      expect(overlaps(database, '2026-12-10', '2026-12-20')).toEqual(['Autumn 2026'])
      expect(overlaps(database, '2026-09-01', '2026-09-20')).toEqual(['Autumn 2026'])
      expect(overlaps(database, '2026-12-11', '2027-01-19')).toEqual([])
    })
  })

  test('a season never overlaps itself, and a retired one is not named', async () => {
    await withDatabase((database) => {
      season(database, { id: 'autumn', name: 'Autumn 2026', starts_on: '2026-09-20', ends_on: '2026-12-10' })
      season(database, { id: 'old', name: 'Autumn 2025', starts_on: '2025-09-20', ends_on: '2026-12-31', archived: 1 })
      expect(overlaps(database, '2026-09-20', '2026-12-10', 'autumn')).toEqual([])
    })
  })

  test('two overlapped seasons are named in date order', async () => {
    await withDatabase((database) => {
      season(database, { id: 'spring', name: 'Spring 2027', starts_on: '2027-01-20', ends_on: '2027-04-10' })
      season(database, { id: 'autumn', name: 'Autumn 2026', starts_on: '2026-09-20', ends_on: '2026-12-10' })
      expect(overlaps(database, '2026-12-01', '2027-02-01')).toEqual(['Autumn 2026', 'Spring 2027'])
    })
  })
})

// Criterion 2: a show with no season takes the one its first performance's night falls in.
describe('a show\'s season fills from its first performance (issue 1352)', () => {
  const at = (iso: string): number => Date.parse(iso) / 1000

  function show(database: TestDatabase, seasonId: string | null = null): string {
    insert(database, 'shows', { id: 'show-1', slug: 'the-seagull', title: 'The Seagull', season_id: seasonId })
    insert(database, 'venues', { id: 'venue-1', name: 'The Test House' })
    insert(database, 'users', { id: 'officer', name: 'Someone', email: 'officer@e2e.newtheatre.org.uk', verified: 1 })
    return 'show-1'
  }

  function performance(database: TestDatabase, id: string, startsAt: number, status = 'DRAFT'): void {
    insert(database, 'performances', { id, show_id: 'show-1', venue_id: 'venue-1', starts_at: startsAt, status })
  }

  function fill(database: TestDatabase, startsAt: number, auditId = 'audit-fill'): void {
    database.batch(fillSeasonStatements({ showId: 'show-1', startsAt, actorId: 'officer', auditId }).map(statement => boundStatement(database, statement)))
  }

  const seasonOf = (database: TestDatabase): string | null =>
    rows<{ seasonId: string | null }>(database, 'SELECT season_id AS seasonId FROM shows WHERE id = ?', 'show-1')[0]!.seasonId

  const trail = (database: TestDatabase) =>
    rows<{ action: string, target: string, detail: string }>(database, 'SELECT action, target, detail FROM audit_log WHERE id = ?', 'audit-fill')

  test('the first performance fills it with the season its night falls in, and the trail says so', async () => {
    await withDatabase((database) => {
      season(database, { id: 'autumn', name: 'Autumn 2026', starts_on: '2026-09-20', ends_on: '2026-12-10' })
      show(database)
      const curtain = at('2026-10-14T18:30:00Z')
      performance(database, 'p-1', curtain)
      fill(database, curtain)

      expect(seasonOf(database)).toBe('autumn')
      const [entry] = trail(database)
      expect(entry).toMatchObject({ action: 'show.updated', target: 'show:show-1' })
      expect(JSON.parse(entry!.detail)).toMatchObject({ changes: { seasonId: { from: null, to: 'autumn' } }, filledFrom: '2026-10-14' })
    })
  })

  test('a curtain after midnight is the night before, so the season\'s last night still counts (0014)', async () => {
    await withDatabase((database) => {
      season(database, { id: 'autumn', name: 'Autumn 2026', starts_on: '2026-09-20', ends_on: '2026-12-10' })
      show(database)
      const curtain = at('2026-12-11T00:30:00Z')
      performance(database, 'p-1', curtain)
      fill(database, curtain)
      expect(seasonOf(database)).toBe('autumn')
    })
  })

  test('a season chosen by hand is never replaced, and nothing is written to the trail', async () => {
    await withDatabase((database) => {
      season(database, { id: 'autumn', name: 'Autumn 2026', starts_on: '2026-09-20', ends_on: '2026-12-10' })
      season(database, { id: 'fringe', name: 'Fringe 2026', starts_on: '2026-08-01', ends_on: '2026-08-31' })
      show(database, 'fringe')
      const curtain = at('2026-10-14T18:30:00Z')
      performance(database, 'p-1', curtain)
      fill(database, curtain)
      expect(seasonOf(database)).toBe('fringe')
      expect(trail(database)).toEqual([])
    })
  })

  test('only the first performance fills it: a later one leaves a show with an earlier live night alone', async () => {
    await withDatabase((database) => {
      season(database, { id: 'spring', name: 'Spring 2027', starts_on: '2027-01-20', ends_on: '2027-04-10' })
      show(database)
      performance(database, 'p-1', at('2027-01-10T19:30:00Z'))
      const later = at('2027-02-10T19:30:00Z')
      performance(database, 'p-2', later)
      fill(database, later)
      expect(seasonOf(database)).toBeNull()
    })
  })

  test('an earlier cancelled night is not the first performance', async () => {
    await withDatabase((database) => {
      season(database, { id: 'spring', name: 'Spring 2027', starts_on: '2027-01-20', ends_on: '2027-04-10' })
      show(database)
      performance(database, 'p-1', at('2027-01-10T19:30:00Z'), 'CANCELLED')
      const later = at('2027-02-10T19:30:00Z')
      performance(database, 'p-2', later)
      fill(database, later)
      expect(seasonOf(database)).toBe('spring')
    })
  })

  test('a retired season is never taken, and a night in no season leaves the show without one', async () => {
    await withDatabase((database) => {
      season(database, { id: 'autumn', name: 'Autumn 2026', starts_on: '2026-09-20', ends_on: '2026-12-10', archived: 1 })
      show(database)
      const curtain = at('2026-10-14T18:30:00Z')
      performance(database, 'p-1', curtain)
      fill(database, curtain)
      expect(seasonOf(database)).toBeNull()
      expect(trail(database)).toEqual([])
    })
  })
})
