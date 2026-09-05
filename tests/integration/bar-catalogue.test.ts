import { describe, expect, test } from 'bun:test'
import { BAR_PRODUCT_REFERENCES, productActivationReferences, productEverSoldQuery, missingBeforeActiveQuery, productSaleReferences } from '#server/utils/bar'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { BarProductReference } from '#server/utils/bar'
import type { BoundStatement, TestDatabase } from '#tests/helpers/database'

// F-111 on the real migrations. What a product needs before it may be sold, and whether it ever
// has been, are questions about rows in other tables rather than flags on this one.

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
  const values = { id: 'cat-1', name: 'Wine', sort: 20, ...over }
  insert(database, 'bar_categories', values)
  return String(values.id)
}

function product(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'prod-1', category_id: 'cat-1', name: 'House red', ...over }
  insert(database, 'bar_products', values)
  return String(values.id)
}

// What F-112 and F-105 will add, stood up here so both predicates can be proved against rows
// that do not exist yet.
const FUTURE_VARIANT: BarProductReference = {
  table: 'future_variants',
  column: 'product_id',
  sale: false,
  requiredToActivate: 'a serving size',
  why: 'a stand-in for product_variants, for proving the activation predicate reads rows',
}

const FUTURE_SALE: BarProductReference = {
  table: 'future_sale_lines',
  column: 'product_id',
  sale: true,
  requiredToActivate: null,
  why: 'a stand-in for the sale lines, for proving the sold predicate reads rows',
}

function withFutureTables(database: TestDatabase): void {
  database.raw.exec(`
    CREATE TABLE future_variants (
      id text PRIMARY KEY,
      product_id text NOT NULL REFERENCES bar_products(id)
    );
    CREATE TABLE future_sale_lines (
      id text PRIMARY KEY,
      product_id text NOT NULL REFERENCES bar_products(id)
    );
  `)
}

function ask<T>(database: TestDatabase, statement: ReturnType<typeof productEverSoldQuery>): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

const sold = (database: TestDatabase, id: string, references = productSaleReferences()): boolean =>
  ask<{ sold: number }>(database, productEverSoldQuery(id, references))[0]!.sold === 1

const missing = (database: TestDatabase, id: string, references = productActivationReferences()): string[] =>
  ask<{ needs: string }>(database, missingBeforeActiveQuery(id, references)).map(row => row.needs)

describe('a product carries what the till has to show (criterion 1)', () => {
  test('it belongs to a category, and the category cannot be dropped under it', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      expect(() => database.batch([['DELETE FROM bar_categories WHERE id = \'cat-1\'']])).toThrow()
      expect(() => product(database, { id: 'prod-2', name: 'House white', category_id: 'nowhere' })).toThrow()
    })
  })

  test('confirmed no allergens is a different answer from no information', async () => {
    await withDatabase((database) => {
      category(database)
      product(database, { allergen_state: 'NONE' })
      product(database, { id: 'prod-2', name: 'House white', allergen_state: 'RECORDED', allergen_note: 'Sulphites' })

      // Recorded means something was recorded, and unknown means nothing was.
      expect(() => product(database, { id: 'prod-3', name: 'Cider', allergen_state: 'RECORDED' })).toThrow()
      expect(() => product(database, { id: 'prod-4', name: 'Stout', allergen_state: 'UNKNOWN', allergen_note: 'Barley' })).toThrow()
    })
  })

  test('a status outside the vocabulary is refused', async () => {
    await withDatabase((database) => {
      category(database)
      expect(() => product(database, { status: 'ARCHIVED' })).toThrow()
    })
  })

  test('the name is held once whatever the capitals', async () => {
    await withDatabase((database) => {
      category(database)
      product(database)
      expect(() => product(database, { id: 'prod-2', name: 'HOUSE RED' })).toThrow()
    })
  })
})

describe('a product cannot go active until it has what a sale needs (criterion 2)', () => {
  test('a product with no serving size cannot go on the till, and the refusal names it', async () => {
    await withDatabase((database) => {
      category(database)
      const id = product(database)
      expect(productActivationReferences().map(reference => reference.table)).toEqual(['product_variants'])
      expect(missing(database, id)).toEqual(['a serving size'])

      insert(database, 'product_variants', { id: 'var-1', product_id: id, serving_kind: 'bottle', label: 'Bottle' })
      expect(missing(database, id)).toEqual([])
    })
  })

  // A retired size is not one the till can draw, so it does not keep a product active on its own.
  test('a size that has been retired does not count towards the requirement', async () => {
    await withDatabase((database) => {
      category(database)
      const id = product(database)
      insert(database, 'product_variants', { id: 'var-1', product_id: id, serving_kind: 'bottle', label: 'Bottle', status: 'RETIRED' })
      expect(missing(database, id)).toEqual(['a serving size'])
    })
  })

  // The recipe requirement is F-113's to add; until it does, a size is the whole of it.
  test('nothing else is required yet, because the table that supplies it is not built', async () => {
    expect(productActivationReferences().map(reference => reference.requiredToActivate)).toEqual(['a serving size'])
  })

  test('a requirement with no row refuses activation and names what is missing', async () => {
    await withDatabase((database) => {
      category(database)
      const id = product(database)
      withFutureTables(database)

      expect(missing(database, id, [FUTURE_VARIANT])).toEqual(['a serving size'])

      insert(database, 'future_variants', { id: 'v1', product_id: id })
      expect(missing(database, id, [FUTURE_VARIANT])).toEqual([])
    })
  })

  // The one that fails when F-112 lands: a new table pointing at bar_products is a sale, a
  // requirement, or neither, and somebody has to say which.
  test('every table pointing at bar_products is classified in the registry', async () => {
    await withDatabase((database) => {
      const tables = rows<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      const pointing: string[] = []
      for (const { name } of tables) {
        for (const key of rows<{ table: string, from: string }>(database, `PRAGMA foreign_key_list('${name}')`)) {
          if (key.table === 'bar_products') pointing.push(`${name}.${key.from}`)
        }
      }
      expect(pointing.sort()).toEqual(BAR_PRODUCT_REFERENCES.map(reference => `${reference.table}.${reference.column}`).sort())
    })
  })
})

describe('a product that has sold is retired, never deleted (criterion 3)', () => {
  test('nothing on the product itself says whether it has sold', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('bar_products')`)
        .map(column => column.name)
      expect(columns.filter(name => /sold|sale|used|ever/.test(name))).toEqual([])
    })
  })

  test('a product nothing has sold has never sold', async () => {
    await withDatabase((database) => {
      category(database)
      const id = product(database)
      expect(productSaleReferences()).toEqual([])
      expect(sold(database, id)).toBe(false)
    })
  })

  test('a sale line is what makes a product sold, and a variant is not', async () => {
    await withDatabase((database) => {
      category(database)
      const id = product(database)
      withFutureTables(database)

      // The classification is what decides, so a variant table declared as no sale reads as none.
      const sales = productSaleReferences([FUTURE_VARIANT, FUTURE_SALE])
      expect(sales).toEqual([FUTURE_SALE])

      insert(database, 'future_variants', { id: 'v1', product_id: id })
      expect(sold(database, id, sales)).toBe(false)

      insert(database, 'future_sale_lines', { id: 'l1', product_id: id })
      expect(sold(database, id, sales)).toBe(true)
    })
  })

  test('a sold product cannot be deleted out from under its history', async () => {
    await withDatabase((database) => {
      category(database)
      const id = product(database)
      withFutureTables(database)
      insert(database, 'future_sale_lines', { id: 'l1', product_id: id })

      expect(() => database.batch([['DELETE FROM bar_products WHERE id = ?', id]])).toThrow()
      database.batch([['UPDATE bar_products SET status = \'RETIRED\' WHERE id = ?', id]])
      expect(rows<{ status: string }>(database, 'SELECT status FROM bar_products')[0]?.status).toBe('RETIRED')
    })
  })
})

describe('the till layout is read, never compiled (criterion 4)', () => {
  test('a change to the display order is a saved row and nothing more', async () => {
    await withDatabase((database) => {
      category(database)
      category(database, { id: 'cat-2', name: 'Soft drinks', sort: 10 })

      const order = () => rows<{ name: string }>(database,
        'SELECT name FROM bar_categories ORDER BY sort, name COLLATE NOCASE').map(row => row.name)
      expect(order()).toEqual(['Soft drinks', 'Wine'])

      database.batch([['UPDATE bar_categories SET sort = 5 WHERE id = \'cat-1\'']])
      expect(order()).toEqual(['Wine', 'Soft drinks'])
    })
  })
})

// `changes()` names the row count of the statement just before it on this connection, so an
// audit insert can read whether *this* UPDATE changed anything, not the resulting state (0049).
describe('changes() after a conditional UPDATE names that UPDATE\'s own effect', () => {
  const statusChange = (from: string, to: string, auditId: string): BoundStatement[] => [
    ['UPDATE bar_products SET status = ? WHERE id = ? AND status = ?', to, 'prod-1', from],
    [`INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ?, NULL, 'bar.product.status.changed', 'bar-product:prod-1', '{}'
      WHERE changes() = 1`, auditId],
  ]

  test('a matching predicate changes the row and writes exactly one audit entry', async () => {
    await withDatabase((database) => {
      category(database)
      product(database, { status: 'ACTIVE' })

      database.batch(statusChange('ACTIVE', 'RETIRED', 'a1'))

      expect(rows<{ status: string }>(database, 'SELECT status FROM bar_products WHERE id = \'prod-1\'')[0]!.status)
        .toBe('RETIRED')
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  // The loser's own predicate matches nothing even though the row now reads RETIRED, which a
  // predicate over the resulting state rather than `changes()` could not tell from a win.
  test('a predicate that already lost the race changes nothing and writes no audit entry', async () => {
    await withDatabase((database) => {
      category(database)
      product(database, { status: 'ACTIVE' })

      database.batch(statusChange('ACTIVE', 'RETIRED', 'a1'))
      // The loser still believes the product was ACTIVE when it read it.
      database.batch(statusChange('ACTIVE', 'RETIRED', 'a2'))

      expect(rows<{ status: string }>(database, 'SELECT status FROM bar_products WHERE id = \'prod-1\'')[0]!.status)
        .toBe('RETIRED')
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  // The route reads this same RETURNING clause to tell a win from a loss (0049); `batch()`
  // discards it, so this goes through `raw` to prove the value the route's own check relies on.
  test('a losing predicate\'s RETURNING is empty, which is what the route refuses on', async () => {
    await withDatabase((database) => {
      category(database)
      product(database, { status: 'ACTIVE' })

      const attempt = (): { id: string }[] => database.raw.prepare(
        'UPDATE bar_products SET status = ? WHERE id = ? AND status = ? RETURNING id',
      ).all('RETIRED', 'prod-1', 'ACTIVE') as { id: string }[]

      expect(attempt()).toHaveLength(1)
      // The loser's predicate still asks for status = 'ACTIVE', which is no longer true.
      expect(attempt()).toHaveLength(0)
    })
  })
})
