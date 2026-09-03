import { describe, expect, test } from 'bun:test'
import { contentWarningsQuery, showWarningsQuery, warningsForListedShowsQuery } from '#server/utils/content-warnings'
import { oneShowScope } from '#server/utils/whats-on'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-102 on the real migrations. The rules the write path holds are in
// tests/unit/content-warnings.test.ts; this is what the vocabulary queries return.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
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

function addWarning(database: TestDatabase, id: string, over: Record<string, unknown> = {}): void {
  database.batch([[
    'INSERT INTO content_warnings (id, slug, title, kind, category, description, icon, sort, archived) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, over.slug ?? id, over.title ?? id, over.kind ?? 'GENERAL', over.category ?? null,
    over.description ?? null, over.icon ?? null, over.sort ?? 0, over.archived ?? 0,
  ]])
}

function carry(database: TestDatabase, showId: string, warningId: string, level: string | null): void {
  database.batch([[
    'INSERT INTO show_content_warnings (id, show_id, warning_id, level) VALUES (?, ?, ?, ?)',
    `scw-${showId}-${warningId}`, showId, warningId, level,
  ]])
}

describe('the vocabulary is a table, and a show picks from it (D-102 criterion 1)', () => {
  test('a warning in use says how many shows carry it', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addWarning(database, 'w-death', { title: 'Death' })
      addWarning(database, 'w-strobe', { title: 'Strobe lighting', kind: 'TECHNICAL' })
      carry(database, seeded.showId, 'w-death', 'DEPICTED')

      const listed = read<{ id: string, showCount: number }>(database, contentWarningsQuery({ includeArchived: true }, 25, 0))
      expect(listed.find(one => one.id === 'w-death')?.showCount).toBe(1)
      expect(listed.find(one => one.id === 'w-strobe')?.showCount).toBe(0)
    })
  })

  test('archived entries are left out when the caller asks for live ones only', async () => {
    await withDatabase((database) => {
      addWarning(database, 'w-live', { title: 'Live' })
      addWarning(database, 'w-retired', { title: 'Retired', archived: 1 })

      const live = read<{ id: string }>(database, contentWarningsQuery({ includeArchived: false }, 25, 0))
      expect(live.map(one => one.id)).toEqual(['w-live'])
    })
  })

  // Staging first, because whether the room strobes is what somebody decides on before they read
  // what the play is about.
  test('staging warnings lead, then the vocabulary\'s own order', async () => {
    await withDatabase((database) => {
      addWarning(database, 'w-a', { title: 'Adult themes', sort: 1 })
      addWarning(database, 'w-b', { title: 'Blood', sort: 0 })
      addWarning(database, 'w-s', { title: 'Smoke', kind: 'TECHNICAL', sort: 9 })

      const listed = read<{ id: string }>(database, contentWarningsQuery({ includeArchived: true }, 25, 0))
      expect(listed.map(one => one.id)).toEqual(['w-s', 'w-b', 'w-a'])
    })
  })

  test('a search binds one parameter and matches the title or the slug', async () => {
    await withDatabase((database) => {
      addWarning(database, 'w-death', { slug: 'death', title: 'Death' })
      addWarning(database, 'w-blood', { slug: 'blood', title: 'Blood' })

      const found = read<{ id: string }>(database, contentWarningsQuery({ includeArchived: true, search: 'dea' }, 25, 0))
      expect(found.map(one => one.id)).toEqual(['w-death'])
    })
  })
})

describe('a show carries the vocabulary rows, never words of its own', () => {
  test('the junction holds no column a person could type prose into', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('show_content_warnings')`)
        .map(column => column.name)
      expect(columns.sort()).toEqual(['id', 'level', 'show_id', 'warning_id'])
    })
  })

  test('a show\'s warnings come back with the vocabulary\'s own columns', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addWarning(database, 'w-death', { title: 'Death', category: 'Distressing content' })
      carry(database, seeded.showId, 'w-death', 'DISCUSSED')

      const [found] = read<{ warningId: string, title: string, category: string, level: string }>(
        database, showWarningsQuery(seeded.showId),
      )
      expect(found?.warningId).toBe('w-death')
      expect(found?.title).toBe('Death')
      expect(found?.category).toBe('Distressing content')
      expect(found?.level).toBe('DISCUSSED')
    })
  })

  test('one show\'s warnings never reach another show', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database)
      const second = tonightsPerformance(database, { suffix: 'b' })
      addWarning(database, 'w-death', { title: 'Death' })
      addWarning(database, 'w-strobe', { title: 'Strobe lighting', kind: 'TECHNICAL' })
      carry(database, first.showId, 'w-death', 'DEPICTED')
      carry(database, second.showId, 'w-strobe', null)

      expect(read<{ warningId: string }>(database, showWarningsQuery(first.showId)).map(one => one.warningId))
        .toEqual(['w-death'])
    })
  })

  // The listing reads every listed show's warnings in one statement scoped by subquery, so the
  // parameter count does not grow with the page (0003, 0006).
  test('the listing\'s warnings query scopes by subquery and binds the address alone', async () => {
    await withDatabase((database) => {
      const [query, ...parameters] = boundStatement(database, warningsForListedShowsQuery(oneShowScope('the-seagull')))
      expect(parameters).toEqual(['the-seagull'])
      expect(query).toContain('IN (SELECT id FROM shows')
    })
  })

  test('a technical warning carries no level and a general one does', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      addWarning(database, 'w-strobe', { title: 'Strobe lighting', kind: 'TECHNICAL' })
      addWarning(database, 'w-death', { title: 'Death' })
      carry(database, seeded.showId, 'w-strobe', null)
      carry(database, seeded.showId, 'w-death', 'MENTIONED')

      const found = read<{ warningId: string, kind: string, level: string | null }>(
        database, warningsForListedShowsQuery(oneShowScope('a-test-show-a')),
      )
      expect(found.map(one => `${one.warningId}:${one.kind}:${one.level ?? 'none'}`))
        .toEqual(['w-strobe:TECHNICAL:none', 'w-death:GENERAL:MENTIONED'])
    })
  })
})

// Criterion 2: confirmed clear and not yet assessed are two states, and the column that holds
// them is not the absence of rows.
describe('confirmed clear is a stored answer, not an empty list', () => {
  test('a show carries the flag beside its warnings', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      database.batch([['UPDATE shows SET warnings_confirmed_none = 1 WHERE id = ?', seeded.showId]])

      const [show] = rows<{ warnings_confirmed_none: number }>(
        database, 'SELECT warnings_confirmed_none FROM shows WHERE id = ?', seeded.showId,
      )
      expect(show?.warnings_confirmed_none).toBe(1)
      expect(read(database, showWarningsQuery(seeded.showId))).toEqual([])
    })
  })
})
