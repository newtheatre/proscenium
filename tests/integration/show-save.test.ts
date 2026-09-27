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

function save(database: TestDatabase, input: ShowUpdateInput): { id: string, seasonId: string | null }[] {
  const [query, ...parameters] = boundStatement(database, updateShowStatement('show-1', input))
  return rows<{ id: string, seasonId: string | null }>(database, query, ...parameters)
}

const stored = (database: TestDatabase) =>
  rows<{ title: string, seasonId: string | null }>(database, 'SELECT title, season_id AS seasonId FROM shows WHERE id = ?', 'show-1')[0]

describe('a Details save and the show\'s season', () => {
  test('a season chosen on a form that loaded the stored one is written', async () => {
    await withDatabase((database) => {
      seeded(database, null)
      expect(save(database, form({ seasonId: 'autumn' }))).toEqual([{ id: 'show-1', seasonId: 'autumn' }])
      expect(stored(database)).toEqual({ title: 'The Seagull, revised', seasonId: 'autumn' })
    })
  })

  test('a form that left the season alone keeps one filled since it loaded, and saves the rest', async () => {
    await withDatabase((database) => {
      seeded(database, 'autumn')
      expect(save(database, form({ seasonId: null, loadedSeasonId: null }))).toEqual([{ id: 'show-1', seasonId: 'autumn' }])
      expect(stored(database)).toEqual({ title: 'The Seagull, revised', seasonId: 'autumn' })
    })
  })

  test('a form that chose a season over one set since it loaded writes nothing', async () => {
    await withDatabase((database) => {
      seeded(database, 'autumn')
      expect(save(database, form({ seasonId: 'fringe', loadedSeasonId: null }))).toEqual([])
      expect(stored(database)).toEqual({ title: 'The Seagull', seasonId: 'autumn' })
    })
  })

  test('clearing the season the form loaded is a change like any other', async () => {
    await withDatabase((database) => {
      seeded(database, 'autumn')
      expect(save(database, form({ seasonId: null, loadedSeasonId: 'autumn' }))).toEqual([{ id: 'show-1', seasonId: null }])
      expect(save(database, form({ seasonId: 'fringe', loadedSeasonId: null }))).toEqual([{ id: 'show-1', seasonId: 'fringe' }])
    })
  })
})
