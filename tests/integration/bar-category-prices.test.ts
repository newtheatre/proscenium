import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { effectiveCategoryPriceColumn, resolvedPriceColumns } from '#server/utils/bar'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// F-121 on the real migrations. A category default is dated and append-only exactly like a
// variant's own price (F-116), and resolution reads it only when the variant has none of its own.

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
  const values = { id: 'cat-1', name: 'Spirits', ...over }
  insert(database, 'bar_categories', values)
  return String(values.id)
}

function product(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'prod-1', category_id: 'cat-1', name: 'Gin', ...over }
  insert(database, 'bar_products', values)
  return String(values.id)
}

function variant(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'var-1', product_id: 'prod-1', serving_kind: 'single', label: 'Single', ...over }
  insert(database, 'product_variants', values)
  return String(values.id)
}

function defaultPrice(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = {
    id: `cp-${Math.random().toString(36).slice(2, 10)}`,
    category_id: 'cat-1',
    serving_kind: 'single',
    price_pence: 250,
    effective_from: '2026-09-01',
    created_at: 1000,
    ...over,
  }
  insert(database, 'category_prices', values)
  return String(values.id)
}

function ownPrice(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = {
    id: `vp-${Math.random().toString(36).slice(2, 10)}`,
    variant_id: 'var-1',
    price_pence: 300,
    effective_from: '2026-09-01',
    created_at: 1000,
    ...over,
  }
  insert(database, 'variant_prices', values)
  return String(values.id)
}

function categoryDefaultOn(database: TestDatabase, on: string): (number | null)[] {
  const [statement, ...parameters] = boundStatement(database,
    effectiveCategoryPriceColumn(sql`p.category_id`, sql`v.serving_kind`, on))
  return rows<{ price: number | null }>(database, `
    SELECT ${statement} AS price
    FROM product_variants v JOIN bar_products p ON p.id = v.product_id
    ORDER BY v.id
  `, ...parameters).map(row => row.price)
}

function resolvedOn(database: TestDatabase, on: string): { price: number | null, source: string | null }[] {
  const { pricePence, priceSource } = resolvedPriceColumns(sql`p.category_id`, 'v', on)
  const [priceStatement, ...priceParameters] = boundStatement(database, pricePence)
  const [sourceStatement, ...sourceParameters] = boundStatement(database, priceSource)
  return rows<{ price: number | null, source: string | null }>(database, `
    SELECT ${priceStatement} AS price, ${sourceStatement} AS source
    FROM product_variants v JOIN bar_products p ON p.id = v.product_id
    ORDER BY v.id
  `, ...priceParameters, ...sourceParameters)
}

describe('a category default price is a dated append-only row (F-121 criterion 1)', () => {
  test('the latest row dated on or before today wins', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      variant(database)
      defaultPrice(database, { price_pence: 250, effective_from: '2026-09-01', created_at: 1000 })
      defaultPrice(database, { price_pence: 300, effective_from: '2026-10-01', created_at: 2000 })

      expect(categoryDefaultOn(database, '2026-08-31')).toEqual([null])
      expect(categoryDefaultOn(database, '2026-09-01')).toEqual([250])
      expect(categoryDefaultOn(database, '2026-10-01')).toEqual([300])
    })
  })

  test('a row cannot be edited or deleted', async () => {
    await withDatabase((database) => {
      category(database)
      const id = defaultPrice(database)

      expect(() => database.batch([['UPDATE category_prices SET price_pence = 1 WHERE id = ?', id]])).toThrow()
      expect(() => database.batch([['DELETE FROM category_prices WHERE id = ?', id]])).toThrow()
    })
  })

  test('two rows on one date are allowed, and the latest written wins', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      variant(database)
      defaultPrice(database, { price_pence: 250, effective_from: '2026-09-01', created_at: 1000 })
      defaultPrice(database, { price_pence: 100, effective_from: '2026-09-01', created_at: 2000 })

      expect(categoryDefaultOn(database, '2026-09-01')).toEqual([100])
    })
  })

  test('a price is whole pence and never negative', async () => {
    await withDatabase((database) => {
      category(database)
      expect(() => defaultPrice(database, { price_pence: -1 })).toThrow()
      defaultPrice(database, { price_pence: 0 })
    })
  })

  test('the date is a civil date, not any string', async () => {
    await withDatabase((database) => {
      category(database)
      expect(() => defaultPrice(database, { effective_from: '01/09/2026' })).toThrow()
      expect(() => defaultPrice(database, { effective_from: '2026-9-1' })).toThrow()
    })
  })

  test('serving kind is keyed separately: a spirit single and double price on their own', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      variant(database, { id: 'var-single', serving_kind: 'single' })
      variant(database, { id: 'var-double', product_id: 'prod-1', serving_kind: 'double' })
      defaultPrice(database, { serving_kind: 'single', price_pence: 250 })
      defaultPrice(database, { id: 'cp-double', serving_kind: 'double', price_pence: 400 })

      const [statement, ...parameters] = boundStatement(database,
        effectiveCategoryPriceColumn(sql`p.category_id`, sql`v.serving_kind`, '2026-09-01'))
      const prices = rows<{ id: string, price: number | null }>(database, `
        SELECT v.id AS id, ${statement} AS price
        FROM product_variants v JOIN bar_products p ON p.id = v.product_id
        ORDER BY v.id
      `, ...parameters)
      expect(prices.find(row => row.id === 'var-single')?.price).toBe(250)
      expect(prices.find(row => row.id === 'var-double')?.price).toBe(400)
    })
  })

  test('the person who set a default cannot be deleted out from under it', async () => {
    await withDatabase((database) => {
      category(database)
      insert(database, 'users', { id: 'u1', email: 'bar@example.invalid', name: 'A Manager', verified: 1 })
      defaultPrice(database, { created_by: 'u1' })

      expect(() => database.batch([['DELETE FROM users WHERE id = ?', 'u1']])).toThrow()
    })
  })
})

describe('resolution is variant price first, category default second (F-121 criterion 2)', () => {
  test('a variant with no price of its own falls back to its category default', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      variant(database)
      defaultPrice(database, { price_pence: 250, effective_from: '2026-09-01' })

      expect(resolvedOn(database, '2026-09-01')).toEqual([{ price: 250, source: 'category' }])
    })
  })

  test('an explicit variant price always beats the category default', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      variant(database)
      defaultPrice(database, { price_pence: 250, effective_from: '2026-09-01' })
      ownPrice(database, { price_pence: 300, effective_from: '2026-09-01' })

      expect(resolvedOn(database, '2026-09-01')).toEqual([{ price: 300, source: 'variant' }])
    })
  })

  test('a variant with neither refuses to sell rather than guessing', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      variant(database)

      expect(resolvedOn(database, '2026-09-01')).toEqual([{ price: null, source: null }])
    })
  })

  test('a category default dated in the future does not resolve early', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      variant(database)
      defaultPrice(database, { price_pence: 250, effective_from: '2099-01-01' })

      expect(resolvedOn(database, '2026-09-01')).toEqual([{ price: null, source: null }])
    })
  })
})
