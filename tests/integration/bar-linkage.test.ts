import { describe, expect, test } from 'bun:test'
import { pouredByColumn, readPouredBy, retireItemStatements, servingsAvailableQuery } from '#server/utils/bar-linkage'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'
import type { TestDatabase } from '#tests/helpers/database'

// F-128 on the real migrations. Which products pour a stocked item, and what its on-hand still
// supports, are questions about the components that already exist: neither direction stores a link.

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

// One stocked gin, two products that pour it (a single and a double of the same product, and a
// cocktail), a mixer offered as a choice, and a product that pours none of it.
function bar(database: TestDatabase): void {
  insert(database, 'users', { id: 'user-1', email: 'manager@newtheatre.org.uk', name: 'Bar manager' })
  insert(database, 'bar_categories', { id: 'cat-1', name: 'Spirits' })
  insert(database, 'bar_items', { id: 'item-gin', name: 'Gin', unit: 'ML', container_ml: 700 })
  insert(database, 'bar_items', { id: 'item-tonic', name: 'Tonic', unit: 'ML', container_ml: 200 })
  insert(database, 'bar_items', { id: 'item-crisps', name: 'Crisps', unit: 'ITEM' })

  insert(database, 'choice_groups', { id: 'group-mixers', name: 'Mixer' })
  insert(database, 'choice_group_items', { id: 'gi-1', choice_group_id: 'group-mixers', item_id: 'item-tonic', qty: 200 })

  insert(database, 'bar_products', { id: 'prod-gin', category_id: 'cat-1', name: 'Gin', status: 'ACTIVE' })
  insert(database, 'product_variants', { id: 'var-single', product_id: 'prod-gin', serving_kind: 'single', label: 'Single', sort: 0 })
  insert(database, 'product_variants', { id: 'var-double', product_id: 'prod-gin', serving_kind: 'double', label: 'Double', sort: 1 })
  insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-single', item_id: 'item-gin', qty: 25 })
  insert(database, 'variant_components', { id: 'c-2', variant_id: 'var-double', item_id: 'item-gin', qty: 50 })
  insert(database, 'variant_components', { id: 'c-3', variant_id: 'var-double', choice_group_id: 'group-mixers', qty: 1 })

  insert(database, 'bar_products', { id: 'prod-negroni', category_id: 'cat-1', name: 'Negroni', status: 'ACTIVE' })
  insert(database, 'product_variants', { id: 'var-negroni', product_id: 'prod-negroni', serving_kind: 'item', label: 'Each' })
  insert(database, 'variant_components', { id: 'c-4', variant_id: 'var-negroni', item_id: 'item-gin', qty: 25 })

  insert(database, 'bar_products', { id: 'prod-crisps', category_id: 'cat-1', name: 'Crisps', status: 'ACTIVE' })
  insert(database, 'product_variants', { id: 'var-crisps', product_id: 'prod-crisps', serving_kind: 'item', label: 'Each' })
  insert(database, 'variant_components', { id: 'c-5', variant_id: 'var-crisps', item_id: 'item-crisps', qty: 1 })
}

const delivery = (database: TestDatabase, itemId: string, qty: number, id = `m-${Math.random().toString(36).slice(2, 10)}`): void =>
  insert(database, 'stock_movements', { id, item_id: itemId, qty, kind: 'DELIVERY', actor_id: 'user-1' })

function pouredBy(database: TestDatabase, itemId: string): { id: string, name: string }[] {
  const [statement, ...parameters] = boundStatement(database, pouredByColumn('i'))
  const [row] = rows<{ pouredBy: string }>(database,
    `SELECT ${statement} AS pouredBy FROM bar_items i WHERE i.id = ?`, ...parameters, itemId)
  return readPouredBy(row?.pouredBy ?? null)
}

function servings(database: TestDatabase, productId: string): { variantId: string, label: string, servings: number | null }[] {
  const [statement, ...parameters] = boundStatement(database, servingsAvailableQuery(productId))
  return rows(database, statement, ...parameters)
}

function run(database: TestDatabase, statements: readonly SQL[]): void {
  database.batch(statements.map(statement => boundStatement(database, statement)))
}

describe('the stock list says what pours each item (F-128 criterion 3)', () => {
  test('an item names the active products that deplete it, once each', async () => {
    await withDatabase((database) => {
      bar(database)
      expect(pouredBy(database, 'item-gin')).toEqual([
        { id: 'prod-gin', name: 'Gin' },
        { id: 'prod-negroni', name: 'Negroni' },
      ])
    })
  })

  // A mixer is poured by whoever chooses it, so the product that offers the choice pours it too.
  test('an item reached through a choice group is poured by the product offering the choice', async () => {
    await withDatabase((database) => {
      bar(database)
      expect(pouredBy(database, 'item-tonic')).toEqual([{ id: 'prod-gin', name: 'Gin' }])
    })
  })

  test('a hidden or retired product, and a retired size, pour nothing', async () => {
    await withDatabase((database) => {
      bar(database)
      database.batch([
        [`UPDATE bar_products SET status = 'HIDDEN' WHERE id = 'prod-negroni'`],
        [`UPDATE product_variants SET status = 'RETIRED' WHERE product_id = 'prod-gin'`],
      ])
      expect(pouredBy(database, 'item-gin')).toEqual([])
    })
  })

  test('an item nothing pours answers an empty list rather than a null', async () => {
    await withDatabase((database) => {
      bar(database)
      insert(database, 'bar_items', { id: 'item-lime', name: 'Lime', unit: 'ITEM' })
      expect(pouredBy(database, 'item-lime')).toEqual([])
    })
  })

  // 0006: a column over the row being read binds nothing per product, so a catalogue of any size
  // costs the same parameters as an empty one.
  test('the cell binds no parameter per product', async () => {
    await withDatabase((database) => {
      bar(database)
      const [, ...parameters] = boundStatement(database, pouredByColumn('i'))
      expect(parameters.length).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
    })
  })
})

describe('a product says how many more it can sell (F-128 criterion 4)', () => {
  test('each size says what the on-hand supports, at its own measure', async () => {
    await withDatabase((database) => {
      bar(database)
      delivery(database, 'item-gin', 700)
      delivery(database, 'item-tonic', 1000)

      expect(servings(database, 'prod-gin')).toEqual([
        { variantId: 'var-single', label: 'Single', servings: 28 },
        { variantId: 'var-double', label: 'Double', servings: 5 },
      ])
    })
  })

  test('the tightest ingredient decides, not the first one', async () => {
    await withDatabase((database) => {
      bar(database)
      delivery(database, 'item-gin', 700)
      delivery(database, 'item-tonic', 400)

      expect(servings(database, 'prod-gin').find(row => row.variantId === 'var-double')?.servings).toBe(2)
    })
  })

  test('an item with nothing on hand sells none more', async () => {
    await withDatabase((database) => {
      bar(database)
      expect(servings(database, 'prod-gin').map(row => row.servings)).toEqual([0, 0])
    })
  })

  test('a size that depletes nothing says nothing rather than zero', async () => {
    await withDatabase((database) => {
      bar(database)
      insert(database, 'product_variants', { id: 'var-nothing', product_id: 'prod-crisps', serving_kind: 'can', label: 'Can', sort: 1 })
      expect(servings(database, 'prod-crisps').find(row => row.variantId === 'var-nothing')?.servings).toBe(null)
    })
  })
})

describe('retiring a stocked item the bar still pours (F-128 criteria 5 and 6)', () => {
  test('the retirement writes nothing while an active product pours it', async () => {
    await withDatabase((database) => {
      bar(database)
      run(database, retireItemStatements('item-gin', { actorId: 'user-1', hideDependents: false }))

      expect(rows(database, `SELECT status FROM bar_items WHERE id = 'item-gin'`)).toEqual([{ status: 'ACTIVE' }])
      expect(rows(database, `SELECT count(*) AS n FROM audit_log`)).toEqual([{ n: 0 }])
    })
  })

  test('with nothing pouring it, and nothing on hand, the item retires and says so', async () => {
    await withDatabase((database) => {
      bar(database)
      run(database, retireItemStatements('item-crisps', { actorId: 'user-1', hideDependents: true }))

      expect(rows(database, `SELECT status FROM bar_items WHERE id = 'item-crisps'`)).toEqual([{ status: 'RETIRED' }])
      expect(rows(database, `SELECT status FROM bar_products WHERE id = 'prod-crisps'`)).toEqual([{ status: 'HIDDEN' }])
      expect(rows(database, `SELECT count(*) AS n FROM audit_log WHERE action = 'bar.item.status.changed'`)).toEqual([{ n: 1 }])
    })
  })

  // The trail says what happened to each product, not only to the item, and is written from the
  // same predicate as the update rather than from a list of ids read first (0049, 0006).
  test('every product taken off the till says so in the trail', async () => {
    await withDatabase((database) => {
      bar(database)
      run(database, retireItemStatements('item-crisps', { actorId: 'user-1', hideDependents: true }))

      expect(rows(database, `
        SELECT target, detail FROM audit_log WHERE action = 'bar.product.status.changed'
      `)).toEqual([{
        target: 'bar-product:prod-crisps',
        detail: JSON.stringify({ changes: { status: { from: 'ACTIVE', to: 'HIDDEN' } } }),
      }])
    })
  })

  // Known issues: the guard read on-hand before the write, so a delivery landing in the window
  // retired an item that had stock again. The sum rides the UPDATE's own predicate instead.
  test('a delivery landing between the decision and the write stops the retirement', async () => {
    await withDatabase((database) => {
      bar(database)
      const statements = retireItemStatements('item-crisps', { actorId: 'user-1', hideDependents: true })
      delivery(database, 'item-crisps', 24)
      run(database, statements)

      expect(rows(database, `SELECT status FROM bar_items WHERE id = 'item-crisps'`)).toEqual([{ status: 'ACTIVE' }])
      expect(rows(database, `SELECT status FROM bar_products WHERE id = 'prod-crisps'`)).toEqual([{ status: 'ACTIVE' }])
    })
  })

  // A recipe changed in the window is the same race from the other side: the hide scopes by
  // subquery over the components rather than by ids read first (0006).
  test('a product that starts pouring the item in the window is hidden with the rest', async () => {
    await withDatabase((database) => {
      bar(database)
      const statements = retireItemStatements('item-crisps', { actorId: 'user-1', hideDependents: true })
      insert(database, 'variant_components', { id: 'c-6', variant_id: 'var-negroni', item_id: 'item-crisps', qty: 1 })
      run(database, statements)

      expect(rows<{ id: string, status: string }>(database, `SELECT id, status FROM bar_products ORDER BY id`))
        .toEqual([
          { id: 'prod-crisps', status: 'HIDDEN' },
          { id: 'prod-gin', status: 'ACTIVE' },
          { id: 'prod-negroni', status: 'HIDDEN' },
        ])
    })
  })

  test('the batch binds no parameter per dependent product', async () => {
    await withDatabase((database) => {
      bar(database)
      for (const statement of retireItemStatements('item-gin', { actorId: 'user-1', hideDependents: true })) {
        const [, ...parameters] = boundStatement(database, statement)
        expect(parameters.length).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
      }
    })
  })
})
