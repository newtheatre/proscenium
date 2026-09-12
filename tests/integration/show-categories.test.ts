import { describe, expect, test } from 'bun:test'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { showCategoriesList } from '#shared/utils/show-categories-list'
import { SHOW_CATEGORY_REFERENCES, showCategoriesClause, showCategoriesQuery, showCategoryInUseQuery } from '#server/utils/show-categories'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// K-129: the declaration is what turns a raw query into a clause, the same route it takes live.
const showCategoriesSchema = filterQuerySchema(showCategoriesList)
function parsedShowCategories(raw: Record<string, string>) {
  const result = showCategoriesSchema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return showCategoriesClause(result.data)
}

// D-131. A show's category, and "in use" is a query over `shows.category_id` rather than a flag.

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

function category(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'c-1', name: 'Drama', ...over }
  insert(database, 'show_categories', values)
  return String(values.id)
}

function inUse(database: TestDatabase, statement: ReturnType<typeof showCategoryInUseQuery>): boolean {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<{ inUse: number }>(database, query, ...parameters)[0]!.inUse === 1
}

describe('a show category is uniquely named (criterion 3)', () => {
  test('the name is held once, whatever the capitals', async () => {
    await withDatabase((database) => {
      category(database)
      expect(() => category(database, { id: 'c-2', name: 'DRAMA' })).toThrow()
      expect(() => category(database, { id: 'c-3', name: 'drama' })).toThrow()
      expect(() => category(database, { id: 'c-4', name: 'Comedy' })).not.toThrow()
    })
  })
})

describe('"in use" is a query over rows, never a flag (criterion 4)', () => {
  test('every table pointing at show_categories is declared in the registry', async () => {
    await withDatabase((database) => {
      const tables = rows<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      const pointing: string[] = []
      for (const { name } of tables) {
        const keys = rows<{ table: string, from: string }>(database, `PRAGMA foreign_key_list('${name}')`)
        for (const key of keys) {
          if (key.table === 'show_categories') pointing.push(`${name}.${key.from}`)
        }
      }
      const declared = SHOW_CATEGORY_REFERENCES.map(reference => `${reference.table}.${reference.column}`)
      expect(pointing.sort()).toEqual(declared.sort())
    })
  })

  test('a fresh category is not in use', async () => {
    await withDatabase((database) => {
      const id = category(database)
      expect(inUse(database, showCategoryInUseQuery(id))).toBe(false)
    })
  })

  test('a show flips it', async () => {
    await withDatabase((database) => {
      const id = category(database)
      insert(database, 'shows', { id: 's-1', slug: 'the-seagull', title: 'The Seagull', category_id: id })
      expect(inUse(database, showCategoryInUseQuery(id))).toBe(true)
    })
  })
})

describe('the listing is searched and paged in SQL', () => {
  test('the archived filter and the page window are the same question the count asks', async () => {
    await withDatabase((database) => {
      category(database)
      category(database, { id: 'c-2', name: 'Comedy' })
      category(database, { id: 'c-3', name: 'Retired', archived: 1 })

      // Ordered by name: "Comedy" sorts before "Drama", so offset 1 lands on the latter.
      const [query, ...parameters] = boundStatement(database, showCategoriesQuery(parsedShowCategories({ archived: 'false' }), 1, 1))
      expect(rows<{ id: string }>(database, query, ...parameters).map(row => row.id)).toEqual(['c-1'])
    })
  })
})
