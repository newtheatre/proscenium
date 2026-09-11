import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { barCategoriesList } from '#shared/utils/bar-categories-list'
import { barItemsList } from '#shared/utils/bar-items-list'
import { barMovementsList } from '#shared/utils/bar-movements-list'
import { barProductsList } from '#shared/utils/bar-products-list'
import { filterQuerySchema, operatorsOf } from '#shared/utils/list-filters'
import { stocktakesList } from '#shared/utils/stocktakes-list'
import { categoriesClause, itemsClause, movementsClause, productsClause } from '#server/utils/bar'
import { stocktakesClause } from '#server/utils/stocktakes'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { FilterField, ListSpec } from '#shared/utils/list-filters'
import type { ListClause } from '#server/utils/list-filters'
import type { TestDatabase } from '#tests/helpers/database'

// The five bar console lists through their declarations (K-129). What each declares is
// tests/unit/list-filters.test.ts; what its predicates do against real rows is here.

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

function ids(database: TestDatabase, table: string, alias: string, clause: ListClause): string[] {
  const statement = sql`SELECT ${sql.raw(alias)}.id AS value FROM ${sql.raw(table)}
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ value: string }>(database, text, ...parameters).map(row => row.value)
}

function query(spec: ListSpec, raw: Record<string, string>) {
  const result = filterQuerySchema(spec).safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

describe('bar categories: sort is the only question there is (K-129 criterion 1)', () => {
  function seed(database: TestDatabase): void {
    insert(database, 'bar_categories', { id: 'cat-ales', name: 'Ales', sort: 10 })
    insert(database, 'bar_categories', { id: 'cat-wines', name: 'Wines', sort: 10 })
    insert(database, 'bar_categories', { id: 'cat-spirits', name: 'Spirits', sort: 20 })
  }

  test('search runs over the name, and the default sort is till order with a name tiebreak', async () => {
    await withDatabase((database) => {
      seed(database)
      const on = (raw: Record<string, string>): string[] =>
        ids(database, 'bar_categories c', 'c', categoriesClause(query(barCategoriesList, raw)))
      expect(on({ search: 'wine' })).toEqual(['cat-wines'])
      expect(on({})).toEqual(['cat-ales', 'cat-wines', 'cat-spirits'])
    })
  })

  test('sorting by name overrides the till order', async () => {
    await withDatabase((database) => {
      seed(database)
      const clause = categoriesClause(query(barCategoriesList, { sort: 'name' }))
      expect(ids(database, 'bar_categories c', 'c', clause)).toEqual(['cat-ales', 'cat-spirits', 'cat-wines'])
    })
  })
})

describe('bar products: category and retired are filters though neither is a plain column (criterion 1)', () => {
  function seed(database: TestDatabase): void {
    insert(database, 'bar_categories', { id: 'cat-a', name: 'Ales', sort: 10 })
    insert(database, 'bar_categories', { id: 'cat-b', name: 'Wines', sort: 10 })
    insert(database, 'bar_categories', { id: 'cat-c', name: 'Spirits', sort: 20 })
    insert(database, 'bar_products', { id: 'p-stout', category_id: 'cat-a', name: 'Stout', sort: 1, status: 'ACTIVE' })
    insert(database, 'bar_products', { id: 'p-bitter', category_id: 'cat-a', name: 'Bitter', sort: 5, status: 'ACTIVE' })
    insert(database, 'bar_products', { id: 'p-merlot', category_id: 'cat-b', name: 'Merlot', sort: 1, status: 'RETIRED' })
    insert(database, 'bar_products', { id: 'p-gin', category_id: 'cat-c', name: 'Gin', sort: 1, status: 'ACTIVE' })
  }

  const on = (database: TestDatabase, raw: Record<string, string>): string[] =>
    ids(database, 'bar_products p JOIN bar_categories c ON c.id = p.category_id', 'p', productsClause(query(barProductsList, raw)))

  test('is, is not and is any of on category, through the join', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, { categoryId: 'is:cat-a' })).toEqual(['p-stout', 'p-bitter'])
      expect(on(database, { categoryId: 'not:cat-a' })).toEqual(['p-merlot', 'p-gin'])
      expect(on(database, { categoryId: 'any:cat-a,cat-c' })).toEqual(['p-stout', 'p-bitter', 'p-gin'])
    })
  })

  test('retired answers from status, not a column of its own', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, { retired: 'true' })).toEqual(['p-merlot'])
      expect(on(database, { retired: 'false' })).toEqual(['p-stout', 'p-bitter', 'p-gin'])
      expect(on(database, {})).toEqual(['p-stout', 'p-bitter', 'p-merlot', 'p-gin'])
    })
  })

  test('the default order is till order: category, its name, then the product\'s own place', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, {})).toEqual(['p-stout', 'p-bitter', 'p-merlot', 'p-gin'])
    })
  })

  // A declared field the binding cannot answer would be a 500 on the first click; caught here.
  test('every field without a column has a binding, for every operator it offers', async () => {
    await withDatabase((database) => {
      seed(database)
      for (const field of barProductsList.fields as readonly FilterField[]) {
        if (field.column) continue
        for (const operator of operatorsOf(field)) {
          const value = field.kind === 'yes-no' ? 'true' : 'cat-a'
          const raw = operator === 'empty' ? 'empty' : `${operator}:${value}`
          expect(() => on(database, { [field.key]: raw })).not.toThrow()
        }
      }
    })
  })

  test('the category list is capped, and one past it is refused before it ever reaches the database', () => {
    const many = Array.from({ length: 20 }, (_, index) => `cat-${index}`)
    expect(filterQuerySchema(barProductsList).safeParse({ categoryId: `any:${many.join(',')}` }).success).toBe(true)
    expect(filterQuerySchema(barProductsList).safeParse({ categoryId: `any:${[...many, 'one-more'].join(',')}` }).success).toBe(false)
  })
})

describe('bar stocked items: retired answers from status (criterion 1)', () => {
  function seed(database: TestDatabase): void {
    insert(database, 'bar_items', { id: 'item-lager', name: 'Lager keg', unit: 'ML', status: 'ACTIVE' })
    insert(database, 'bar_items', { id: 'item-tonic', name: 'Tonic', unit: 'ML', status: 'ACTIVE' })
    insert(database, 'bar_items', { id: 'item-red', name: 'House red 750ml', unit: 'ML', status: 'RETIRED' })
  }

  const on = (database: TestDatabase, raw: Record<string, string>): string[] =>
    ids(database, 'bar_items i', 'i', itemsClause(query(barItemsList, raw)))

  test('retired is true, false or unasked, and search runs over the name', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, { retired: 'true' })).toEqual(['item-red'])
      expect(on(database, { retired: 'false' })).toEqual(['item-lager', 'item-tonic'])
      expect(on(database, { search: 'ton' })).toEqual(['item-tonic'])
    })
  })

  test('the default order is active first, then a name tiebreak, and a sort by name overrides it', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, {})).toEqual(['item-lager', 'item-tonic', 'item-red'])
      expect(on(database, { sort: 'name' })).toEqual(['item-red', 'item-lager', 'item-tonic'])
    })
  })

  test('every field without a column has a binding, for every operator it offers', async () => {
    await withDatabase((database) => {
      seed(database)
      for (const field of barItemsList.fields as readonly FilterField[]) {
        if (field.column) continue
        for (const operator of operatorsOf(field)) {
          const raw = operator === 'empty' ? 'empty' : `${operator}:true`
          expect(() => on(database, { [field.key]: raw })).not.toThrow()
        }
      }
    })
  })
})

describe('bar stock movements: item and kind on real columns, newest first (criterion 1)', () => {
  function seed(database: TestDatabase): void {
    insert(database, 'bar_items', { id: 'item-keg', name: 'Keg', unit: 'ML' })
    insert(database, 'bar_items', { id: 'item-bottle', name: 'Bottle', unit: 'ML' })
    const t0 = 1_700_000_000
    // Two movements in the same second, so the tiebreak on insertion order is what is on trial.
    insert(database, 'stock_movements', { id: 'm-1', item_id: 'item-keg', qty: 100, kind: 'DELIVERY', created_at: t0 })
    insert(database, 'stock_movements', { id: 'm-2', item_id: 'item-keg', qty: -10, kind: 'WASTAGE', reason: 'BREAKAGE', created_at: t0 })
    insert(database, 'stock_movements', { id: 'm-3', item_id: 'item-keg', qty: 5, kind: 'ADJUST', reason: 'COUNT_CORRECTION', created_at: t0 + 60 })
    insert(database, 'stock_movements', { id: 'm-4', item_id: 'item-bottle', qty: 50, kind: 'DELIVERY', created_at: t0 + 120 })
  }

  const on = (database: TestDatabase, raw: Record<string, string>): string[] =>
    ids(database, 'stock_movements m JOIN bar_items i ON i.id = m.item_id', 'm', movementsClause(query(barMovementsList, raw)))

  test('is, is not and is any of on the stocked item', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, { itemId: 'is:item-keg' })).toEqual(['m-3', 'm-1', 'm-2'])
      expect(on(database, { itemId: 'not:item-keg' })).toEqual(['m-4'])
      expect(on(database, { itemId: 'any:item-keg,item-bottle' })).toEqual(['m-4', 'm-3', 'm-1', 'm-2'])
    })
  })

  test('what happened filters the same way', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, { kind: 'is:DELIVERY' })).toEqual(['m-4', 'm-1'])
      expect(on(database, { kind: 'not:DELIVERY' })).toEqual(['m-3', 'm-2'])
    })
  })

  test('newest first, and a tie within the second breaks on insertion order, not a random id', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, {})).toEqual(['m-4', 'm-3', 'm-1', 'm-2'])
      expect(on(database, { sort: 'recordedOrder', direction: 'asc' })).toEqual(['m-1', 'm-2', 'm-3', 'm-4'])
    })
  })

  test('the item list is capped, and one past it is refused before it ever reaches the database', () => {
    const many = Array.from({ length: 20 }, (_, index) => `item-${index}`)
    expect(filterQuerySchema(barMovementsList).safeParse({ itemId: `any:${many.join(',')}` }).success).toBe(true)
    expect(filterQuerySchema(barMovementsList).safeParse({ itemId: `any:${[...many, 'one-more'].join(',')}` }).success).toBe(false)
  })
})

describe('bar stocktakes: status is the only text there is to search (criterion 1)', () => {
  function seed(database: TestDatabase): void {
    insert(database, 'users', { id: 'u-officer', email: 'officer@example.test', name: 'Ophelia Officer' })
    const t0 = 1_700_000_000
    insert(database, 'stocktakes', { id: 'st-1', status: 'APPLIED', opened_by: 'u-officer', opened_at: t0, applied_by: 'u-officer', applied_at: t0 + 60 })
    insert(database, 'stocktakes', { id: 'st-2', status: 'OPEN', opened_by: 'u-officer', opened_at: t0 + 120 })
  }

  const on = (database: TestDatabase, raw: Record<string, string>): string[] =>
    ids(database, 'stocktakes t', 't', stocktakesClause(query(stocktakesList, raw)))

  test('status is a filter and the search box, and the default order is newest opened first', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(on(database, { status: 'is:OPEN' })).toEqual(['st-2'])
      expect(on(database, { search: 'open' })).toEqual(['st-2'])
      expect(on(database, { search: 'applied' })).toEqual(['st-1'])
      expect(on(database, {})).toEqual(['st-2', 'st-1'])
      expect(on(database, { direction: 'asc' })).toEqual(['st-1', 'st-2'])
    })
  })

  test('the status list is capped, and one past it is refused before it ever reaches the database', () => {
    const many = ['OPEN', 'APPLIED']
    expect(filterQuerySchema(stocktakesList).safeParse({ status: `any:${many.join(',')}` }).success).toBe(true)
  })
})
