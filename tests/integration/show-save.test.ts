import { describe, expect, test } from 'bun:test'
import { updateShowStatement } from '#server/utils/programme'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { ShowUpdateInput } from '#shared/utils/programme'
import type { TestDatabase } from '#tests/helpers/database'

// Saving a show's Details never undoes a season set since the form loaded, whether by another
// editor or by the first performance filling it (D-131 criterion 2, 0003).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seeded(database: TestDatabase, seasonId: string | null): void {
  database.batch([
    ['INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', 'autumn', 'Autumn 2026', '2026-09-20', '2026-12-10'],
    ['INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', 'fringe', 'Fringe 2026', '2026-08-01', '2026-08-31'],
    ['INSERT INTO shows (id, slug, title, season_id) VALUES (?, ?, ?, ?)', 'show-1', 'the-seagull', 'The Seagull', seasonId],
  ])
}

const form = (over: Partial<ShowUpdateInput>): ShowUpdateInput => ({
  title: 'The Seagull, revised',
  slug: 'the-seagull',
  seasonId: null,
  loadedSeasonId: null,
  ...over,
})

function save(database: TestDatabase, input: ShowUpdateInput): { id: string }[] {
  const [query, ...parameters] = boundStatement(database, updateShowStatement('show-1', input))
  return rows<{ id: string }>(database, query, ...parameters)
}

const stored = (database: TestDatabase) =>
  rows<{ title: string, seasonId: string | null, categoryId: string | null }>(
    database, 'SELECT title, season_id AS seasonId, category_id AS categoryId FROM shows WHERE id = ?', 'show-1',
  )[0]

describe('a Details save and the show\'s season', () => {
  test('a season chosen on a form that loaded the stored one is written', async () => {
    await withDatabase((database) => {
      seeded(database, null)
      expect(save(database, form({ seasonId: 'autumn' }))).toEqual([{ id: 'show-1' }])
      expect(stored(database)).toMatchObject({ title: 'The Seagull, revised', seasonId: 'autumn' })
    })
  })

  test('a form that left the season alone keeps one filled since it loaded, and saves the rest', async () => {
    await withDatabase((database) => {
      seeded(database, 'autumn')
      expect(save(database, form({ seasonId: null, loadedSeasonId: null }))).toEqual([{ id: 'show-1' }])
      expect(stored(database)).toMatchObject({ title: 'The Seagull, revised', seasonId: 'autumn' })
    })
  })

  test('a form that chose a season over one set since it loaded writes nothing', async () => {
    await withDatabase((database) => {
      seeded(database, 'autumn')
      expect(save(database, form({ seasonId: 'fringe', loadedSeasonId: null }))).toEqual([])
      expect(stored(database)).toMatchObject({ title: 'The Seagull', seasonId: 'autumn' })
    })
  })

  test('clearing the season the form loaded is a change like any other', async () => {
    await withDatabase((database) => {
      seeded(database, 'autumn')
      expect(save(database, form({ seasonId: null, loadedSeasonId: 'autumn' }))).toEqual([{ id: 'show-1' }])
      expect(stored(database)?.seasonId).toBeNull()
      expect(save(database, form({ seasonId: 'fringe', loadedSeasonId: null }))).toEqual([{ id: 'show-1' }])
      expect(stored(database)?.seasonId).toBe('fringe')
    })
  })
})

// D-131 criterion 5: a retired season or category is not chosen for new work, and one the show
// already carries stays put through any save.
describe('a Details save and retired vocabulary', () => {
  function retire(database: TestDatabase): void {
    database.batch([
      ['INSERT INTO seasons (id, name, starts_on, ends_on, archived) VALUES (?, ?, ?, ?, 1)', 'spring', 'Spring 2026', '2026-01-20', '2026-04-10'],
      ['INSERT INTO show_categories (id, name, archived) VALUES (?, ?, 1)', 'mime', 'Mime'],
      ['INSERT INTO show_categories (id, name, archived) VALUES (?, ?, 0)', 'drama', 'Drama'],
    ])
  }

  test('a retired season or category is refused as a new choice', async () => {
    await withDatabase((database) => {
      seeded(database, null)
      retire(database)
      expect(save(database, form({ seasonId: 'spring' }))).toEqual([])
      expect(save(database, form({ categoryId: 'mime' }))).toEqual([])
      expect(stored(database)).toMatchObject({ title: 'The Seagull', seasonId: null, categoryId: null })
      expect(save(database, form({ categoryId: 'drama' }))).toEqual([{ id: 'show-1' }])
    })
  })

  test('one the show already carries is kept through a save', async () => {
    await withDatabase((database) => {
      seeded(database, null)
      retire(database)
      database.batch([['UPDATE shows SET season_id = ?, category_id = ? WHERE id = ?', 'spring', 'mime', 'show-1']])
      expect(save(database, form({ seasonId: 'spring', loadedSeasonId: 'spring', categoryId: 'mime' }))).toEqual([{ id: 'show-1' }])
      expect(stored(database)).toMatchObject({ title: 'The Seagull, revised', seasonId: 'spring', categoryId: 'mime' })
    })
  })
})
