import { describe, expect, test } from 'bun:test'
import { VARIANT_REFERENCES, effectivePriceColumn, everPricedColumn, retiredIngredientsQuery, variantEverSoldQuery } from '#server/utils/bar'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { BoundStatement, TestDatabase } from '#tests/helpers/database'

// F-112 and F-116 on the real migrations. A size is a row, its depletion is stated in the stocked
// item's own units, and its price is an append-only dated series (0017, 0010).

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

// One stocked bottle, one product, and the two sizes the audit says the old model could not hold.
function wine(database: TestDatabase): void {
  insert(database, 'bar_items', { id: 'item-1', name: 'House red', unit: 'ML', container_ml: 750 })
  insert(database, 'bar_items', { id: 'item-2', name: 'Tonic', unit: 'ML', container_ml: 200 })
  insert(database, 'bar_categories', { id: 'cat-1', name: 'Wine' })
  insert(database, 'bar_products', { id: 'prod-1', category_id: 'cat-1', name: 'House red' })
}

function variant(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'var-1', product_id: 'prod-1', serving_kind: 'bottle', label: 'Bottle', ...over }
  insert(database, 'product_variants', values)
  return String(values.id)
}

function price(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: `p-${Math.random().toString(36).slice(2, 10)}`, variant_id: 'var-1', price_pence: 1800, effective_from: '2026-09-01', created_at: 1000, ...over }
  insert(database, 'variant_prices', values)
  return String(values.id)
}

function effectiveOn(database: TestDatabase, day: string): (number | null)[] {
  const [statement, ...parameters] = boundStatement(database, effectivePriceColumn('v', day))
  return rows<{ price: number | null }>(database,
    `SELECT ${statement} AS price FROM product_variants v ORDER BY v.sort, v.id`, ...parameters)
    .map(row => row.price)
}

function retired(database: TestDatabase, productId: string): string[] {
  const [statement, ...parameters] = boundStatement(database, retiredIngredientsQuery(productId))
  return rows<{ name: string }>(database, statement, ...parameters).map(row => row.name)
}

describe('a recipe cannot go active while it still calls for something retired (F-113 criterion 5)', () => {
  test('a retired direct ingredient is named', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database, { status: 'ACTIVE' })
      insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', item_id: 'item-1', qty: 750 })
      expect(retired(database, 'prod-1')).toEqual([])

      database.batch([['UPDATE bar_items SET status = \'RETIRED\' WHERE id = \'item-1\'']])
      expect(retired(database, 'prod-1')).toEqual(['House red'])
    })
  })

  // A retired variant is not one the till can draw, so what it calls for cannot block the product.
  test('a retired ingredient behind a retired variant does not count', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database, { status: 'RETIRED' })
      insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', item_id: 'item-1', qty: 750 })
      database.batch([['UPDATE bar_items SET status = \'RETIRED\' WHERE id = \'item-1\'']])
      expect(retired(database, 'prod-1')).toEqual([])
    })
  })

  test('a retired option behind an attached choice group is named the same way', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database, { status: 'ACTIVE' })
      insert(database, 'choice_groups', { id: 'cg-1', name: 'Mixers' })
      insert(database, 'choice_group_items', { id: 'cgi-1', choice_group_id: 'cg-1', item_id: 'item-2', qty: 200 })
      insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', choice_group_id: 'cg-1', qty: 25 })
      expect(retired(database, 'prod-1')).toEqual([])

      database.batch([['UPDATE bar_items SET status = \'RETIRED\' WHERE id = \'item-2\'']])
      expect(retired(database, 'prod-1')).toEqual(['Tonic'])
    })
  })
})

describe('a size is a row against one stocked thing (F-112 criteria 1 and 4)', () => {
  test('one stocked bottle sells four ways, each with its own depletion', async () => {
    await withDatabase((database) => {
      wine(database)
      for (const [id, kind, label, qty] of [
        ['var-1', 'bottle', 'Bottle', 750],
        ['var-2', '125ml', 'Small glass', 125],
        ['var-3', '175ml', 'Standard glass', 175],
        ['var-4', '250ml', 'Large glass', 250],
      ] as const) {
        variant(database, { id, serving_kind: kind, label })
        insert(database, 'variant_components', { id: `c-${id}`, variant_id: id, item_id: 'item-1', qty })
      }

      const depletion = rows<{ label: string, qty: number }>(database, `
        SELECT v.label AS label, c.qty AS qty
        FROM product_variants v JOIN variant_components c ON c.variant_id = v.id
        WHERE c.item_id = 'item-1' ORDER BY c.qty
      `)
      expect(depletion.map(row => row.qty)).toEqual([125, 175, 250, 750])
    })
  })

  test('a product holds each serving kind once', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      expect(() => variant(database, { id: 'var-2', label: 'Bottle again' })).toThrow()
    })
  })

  // The old estate stored a container size on the product and a migration clobbered it (PR-12).
  test('no size is stored on the product, so there is nothing for a migration to clobber', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('bar_products')`)
        .map(column => column.name)
      expect(columns.filter(name => /size|ml|container|volume|serving/.test(name))).toEqual([])
    })
  })

  test('a depletion is positive and stated in the item\'s own units', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      expect(() => insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', item_id: 'item-1', qty: 0 })).toThrow()
      expect(() => insert(database, 'variant_components', { id: 'c-2', variant_id: 'var-1', item_id: 'item-1', qty: -750 })).toThrow()
      insert(database, 'variant_components', { id: 'c-3', variant_id: 'var-1', item_id: 'item-1', qty: 750 })
    })
  })

  test('a stocked item appears once in a variant, at the quantity a serving uses', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', item_id: 'item-1', qty: 750 })
      expect(() => insert(database, 'variant_components', { id: 'c-2', variant_id: 'var-1', item_id: 'item-1', qty: 25 })).toThrow()
    })
  })

  // One level deep by construction: there is no column a component could point at a product with.
  test('a component names a stocked item or a choice of them, never another product', async () => {
    await withDatabase((database) => {
      const keys = rows<{ table: string }>(database, `PRAGMA foreign_key_list('variant_components')`)
      expect(keys.map(key => key.table).sort()).toEqual(['bar_items', 'choice_groups', 'product_variants'])

      wine(database)
      variant(database)
      insert(database, 'choice_groups', { id: 'cg-1', name: 'Mixers' })
      // Exactly one of the two, so neither and both are refused.
      expect(() => insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', qty: 200 })).toThrow()
      expect(() => insert(database, 'variant_components', { id: 'c-2', variant_id: 'var-1', item_id: 'item-1', choice_group_id: 'cg-1', qty: 200 })).toThrow()
      insert(database, 'variant_components', { id: 'c-3', variant_id: 'var-1', choice_group_id: 'cg-1', qty: 200 })
    })
  })

  // The pair-unique index on (variant, group) alone would allow this; only the partial index stops it.
  test('a variant holds at most one choice group, database-enforced', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      insert(database, 'choice_groups', { id: 'cg-1', name: 'Mixers' })
      insert(database, 'choice_groups', { id: 'cg-2', name: 'Garnishes' })
      insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', choice_group_id: 'cg-1', qty: 1 })
      expect(() => insert(database, 'variant_components', { id: 'c-2', variant_id: 'var-1', choice_group_id: 'cg-2', qty: 1 })).toThrow()
    })
  })

  test('a choice group offers stocked items at their own quantities', async () => {
    await withDatabase((database) => {
      wine(database)
      insert(database, 'choice_groups', { id: 'cg-1', name: 'Mixers' })
      insert(database, 'choice_group_items', { id: 'cgi-1', choice_group_id: 'cg-1', item_id: 'item-2', qty: 200 })

      expect(() => insert(database, 'choice_group_items', { id: 'cgi-2', choice_group_id: 'cg-1', item_id: 'item-2', qty: 150 })).toThrow()
      expect(() => insert(database, 'choice_group_items', { id: 'cgi-3', choice_group_id: 'cg-1', item_id: 'item-1', qty: 0 })).toThrow()
      // An option's stocked item cannot be dropped out from under it.
      expect(() => database.batch([['DELETE FROM bar_items WHERE id = \'item-2\'']])).toThrow()
    })
  })
})

describe('a variant that has sold is retired, never deleted (F-112 criterion 5)', () => {
  test('nothing on the variant itself says whether it has sold', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('product_variants')`)
        .map(column => column.name)
      expect(columns.filter(name => /sold|sale|used|ever/.test(name))).toEqual([])
    })
  })

  test('retiring hides it and touches no price row and no component', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', item_id: 'item-1', qty: 750 })
      price(database)

      database.batch([['UPDATE product_variants SET status = \'RETIRED\' WHERE id = \'var-1\'']])
      expect(rows(database, 'SELECT id FROM variant_prices')).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM variant_components')).toHaveLength(1)
    })
  })

  // A price row is append-only, so the cascade that would take it cannot fire.
  test('a variant with a price history cannot be deleted out from under it', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      price(database)
      expect(() => database.batch([['DELETE FROM product_variants WHERE id = \'var-1\'']])).toThrow()
      expect(rows(database, 'SELECT id FROM variant_prices')).toHaveLength(1)
    })
  })

  test('a variant nothing prices and nothing sold takes its components with it', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-1', item_id: 'item-1', qty: 750 })

      database.batch([['DELETE FROM product_variants WHERE id = \'var-1\'']])
      expect(rows(database, 'SELECT id FROM variant_components')).toHaveLength(0)
    })
  })

  test('a variant nothing has been sold as has never sold', async () => {
    await withDatabase((database) => {
      wine(database)
      const id = variant(database)
      const [statement, ...parameters] = boundStatement(database, variantEverSoldQuery(id))
      expect(rows<{ sold: number }>(database, statement, ...parameters)[0]!.sold).toBe(0)
    })
  })

  // Fails when a new FK-bound table lands unclassified. Cannot see `ledger_lines.product_variant_id`,
  // which carries no FK by design: F-105 classifies that one by hand.
  test('every table pointing at product_variants by foreign key is classified in the registry', async () => {
    await withDatabase((database) => {
      const tables = rows<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      const pointing: string[] = []
      for (const { name } of tables) {
        for (const key of rows<{ table: string, from: string }>(database, `PRAGMA foreign_key_list('${name}')`)) {
          if (key.table === 'product_variants') pointing.push(`${name}.${key.from}`)
        }
      }
      expect(pointing.sort()).toEqual(VARIANT_REFERENCES.map(reference => `${reference.table}.${reference.column}`).sort())
    })
  })
})

describe('a price is a dated append-only row (F-116 criteria 1, 2 and 3)', () => {
  test('the latest row dated on or before today wins', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      price(database, { price_pence: 1800, effective_from: '2026-09-01', created_at: 1000 })
      price(database, { price_pence: 2000, effective_from: '2026-10-01', created_at: 2000 })

      expect(effectiveOn(database, '2026-08-31')).toEqual([null])
      expect(effectiveOn(database, '2026-09-01')).toEqual([1800])
      expect(effectiveOn(database, '2026-09-30')).toEqual([1800])
      expect(effectiveOn(database, '2026-10-01')).toEqual([2000])
    })
  })

  test('a price row cannot be edited or deleted', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      const id = price(database)

      expect(() => database.batch([['UPDATE variant_prices SET price_pence = 1 WHERE id = ?', id]])).toThrow()
      expect(() => database.batch([['DELETE FROM variant_prices WHERE id = ?', id]])).toThrow()
      expect(rows<{ price: number }>(database, 'SELECT price_pence AS price FROM variant_prices')[0]?.price).toBe(1800)
    })
  })

  // The old estate held one row per product per day, which made a same-day mistake uncorrectable.
  test('two rows on one date are allowed, and the latest written wins', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      price(database, { price_pence: 1800, effective_from: '2026-09-01', created_at: 1000 })
      price(database, { price_pence: 800, effective_from: '2026-09-01', created_at: 2000 })
      expect(effectiveOn(database, '2026-09-01')).toEqual([800])

      price(database, { price_pence: 1800, effective_from: '2026-09-01', created_at: 3000 })
      expect(effectiveOn(database, '2026-09-01')).toEqual([1800])
      expect(rows(database, 'SELECT id FROM variant_prices')).toHaveLength(3)
    })
  })

  test('a future row waits for its date and then takes effect', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      price(database, { price_pence: 1800, effective_from: '2026-09-01', created_at: 1000 })
      price(database, { price_pence: 1900, effective_from: '2027-01-01', created_at: 2000 })

      expect(effectiveOn(database, '2026-12-31')).toEqual([1800])
      expect(effectiveOn(database, '2027-01-01')).toEqual([1900])
    })
  })

  // A future-dated row prices the variant even though nothing is charged for it yet, so deletion
  // (which reads price rows, not today's price) must already be refused.
  test('a variant with only a future price has priced, though nothing is charged today', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      price(database, { effective_from: '2099-01-01' })

      expect(effectiveOn(database, '2026-09-04')).toEqual([null])
      const [statement, ...parameters] = boundStatement(database, everPricedColumn('v'))
      const priced = rows<{ priced: number }>(database,
        `SELECT ${statement} AS priced FROM product_variants v`, ...parameters)
      expect(priced[0]!.priced).toBe(1)
    })
  })

  test('a price is whole pence and never negative', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      expect(() => price(database, { price_pence: -100 })).toThrow()
      price(database, { price_pence: 0 })
    })
  })

  test('an effective date is a civil date, not an instant', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      expect(() => price(database, { effective_from: '01/09/2026' })).toThrow()
      expect(() => price(database, { effective_from: '2026-9-1' })).toThrow()
    })
  })

  test('the person who set a price cannot be deleted out from under it', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database)
      insert(database, 'users', { id: 'u1', email: 'bar@example.invalid', name: 'A Manager', verified: 1 })
      price(database, { created_by: 'u1' })
      expect(() => database.batch([['DELETE FROM users WHERE id = \'u1\'']])).toThrow()
    })
  })
})

// `changes()` names the row count of the statement just before it on this connection, so an
// audit insert can read whether *this* UPDATE changed anything, not the resulting state (0003).
describe('changes() after a conditional UPDATE names that UPDATE\'s own effect', () => {
  const statusChange = (from: string, to: string, auditId: string): BoundStatement[] => [
    ['UPDATE product_variants SET status = ? WHERE id = ? AND status = ?', to, 'var-1', from],
    [`INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ?, NULL, 'bar.variant.status.changed', 'bar-variant:var-1', '{}'
      WHERE changes() = 1`, auditId],
  ]

  test('a matching predicate changes the row and writes exactly one audit entry', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database, { status: 'ACTIVE' })

      database.batch(statusChange('ACTIVE', 'RETIRED', 'a1'))

      expect(rows<{ status: string }>(database, 'SELECT status FROM product_variants WHERE id = \'var-1\'')[0]!.status)
        .toBe('RETIRED')
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })

  // The loser's own predicate matches nothing even though the row now reads RETIRED, which a
  // predicate over the resulting state rather than `changes()` could not tell from a win.
  test('a predicate that already lost the race changes nothing and writes no audit entry', async () => {
    await withDatabase((database) => {
      wine(database)
      variant(database, { status: 'ACTIVE' })

      database.batch(statusChange('ACTIVE', 'RETIRED', 'a1'))
      // The loser still believes the variant was ACTIVE when it read it.
      database.batch(statusChange('ACTIVE', 'RETIRED', 'a2'))

      expect(rows<{ status: string }>(database, 'SELECT status FROM product_variants WHERE id = \'var-1\'')[0]!.status)
        .toBe('RETIRED')
      expect(rows(database, 'SELECT id FROM audit_log')).toHaveLength(1)
    })
  })
})
