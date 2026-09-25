import { describe, expect, test } from 'bun:test'
import { STOCK_COUNTED_QUERY, checkIdHeld, pouredByColumn, readPouredBy, readRestrictedPours, readTillServings, restrictedPoursColumn, retireItemStatements, servingsAvailableQuery, tillServingsQuery, withoutCheckIdPredicate } from '#server/utils/bar-linkage'
import type { TillServings, TillServingsRow } from '#server/utils/bar-linkage'
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

function run(database: TestDatabase, plan: { statements: readonly SQL[] }): void {
  database.batch(plan.statements.map(statement => boundStatement(database, statement)))
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
      const plan = retireItemStatements('item-crisps', { actorId: 'user-1', hideDependents: true })
      delivery(database, 'item-crisps', 24)
      run(database, plan)

      expect(rows(database, `SELECT status FROM bar_items WHERE id = 'item-crisps'`)).toEqual([{ status: 'ACTIVE' }])
      expect(rows(database, `SELECT status FROM bar_products WHERE id = 'prod-crisps'`)).toEqual([{ status: 'ACTIVE' }])
    })
  })

  // A recipe changed in the window is the same race from the other side: the hide scopes by
  // subquery over the components rather than by ids read first (0006).
  test('a product that starts pouring the item in the window is hidden with the rest', async () => {
    await withDatabase((database) => {
      bar(database)
      const plan = retireItemStatements('item-crisps', { actorId: 'user-1', hideDependents: true })
      insert(database, 'variant_components', { id: 'c-6', variant_id: 'var-negroni', item_id: 'item-crisps', qty: 1 })
      run(database, plan)

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
      for (const statement of retireItemStatements('item-gin', { actorId: 'user-1', hideDependents: true }).statements) {
        const [, ...parameters] = boundStatement(database, statement)
        expect(parameters.length).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
      }
    })
  })
})

function tillRead(database: TestDatabase): TillServings {
  const [statement, ...parameters] = boundStatement(database, tillServingsQuery())
  return readTillServings(rows<TillServingsRow>(database, statement, ...parameters))
}

describe('the till reads every size\'s servings in one query (F-128 criterion 8)', () => {
  function tillServings(database: TestDatabase): Map<string, number | null> {
    return tillRead(database).sizes
  }

  test('every active size reads what its own product page reads', async () => {
    await withDatabase((database) => {
      bar(database)
      delivery(database, 'item-gin', 700)
      delivery(database, 'item-tonic', 400)

      const till = tillServings(database)
      for (const productId of ['prod-gin', 'prod-negroni', 'prod-crisps']) {
        for (const row of servings(database, productId)) expect(till.get(row.variantId)).toBe(row.servings)
      }
      expect(till.get('var-double')).toBe(2)
      expect(till.get('var-crisps')).toBe(0)
    })
  })

  test('a hidden product and a retired size are not on the till, so they are not read', async () => {
    await withDatabase((database) => {
      bar(database)
      database.batch([
        [`UPDATE bar_products SET status = 'HIDDEN' WHERE id = ?`, 'prod-negroni'],
        [`UPDATE product_variants SET status = 'RETIRED' WHERE id = ?`, 'var-double'],
      ])
      expect([...tillServings(database).keys()].sort()).toEqual(['var-crisps', 'var-single'])
    })
  })

  // 0006 from the second direction: a read walking the whole catalogue binds nothing per row of it.
  test('the read binds no parameter at all, however large the catalogue', async () => {
    await withDatabase((database) => {
      bar(database)
      const [, ...parameters] = boundStatement(database, tillServingsQuery())
      expect(parameters).toEqual([])
    })
  })
})

// The double offers a mixer: tonic, and a soda added here with none delivered.
describe('the same read carries each option of a choice (F-128 criterion 9)', () => {
  function withSoda(database: TestDatabase): void {
    bar(database)
    insert(database, 'bar_items', { id: 'item-soda', name: 'Soda', unit: 'ML', container_ml: 200 })
    insert(database, 'choice_group_items', { id: 'gi-2', choice_group_id: 'group-mixers', item_id: 'item-soda', qty: 200, sort: 1 })
  }

  test('an empty option reads nought while the size still reads its best-stocked option', async () => {
    await withDatabase((database) => {
      withSoda(database)
      delivery(database, 'item-gin', 700)
      delivery(database, 'item-tonic', 400)
      const till = tillRead(database)
      expect(till.sizes.get('var-double')).toBe(2)
      expect(till.options.get('var-double')?.get('gi-1')).toBe(2)
      expect(till.options.get('var-double')?.get('gi-2')).toBe(0)
    })
  })

  test('an option is held to the size\'s fixed components as well as its own item', async () => {
    await withDatabase((database) => {
      withSoda(database)
      delivery(database, 'item-gin', 60)
      delivery(database, 'item-tonic', 400)
      expect(tillRead(database).options.get('var-double')?.get('gi-1')).toBe(1)
    })
  })

  test('a size with no choice, or not on the till, has no options read', async () => {
    await withDatabase((database) => {
      withSoda(database)
      database.batch([[`UPDATE bar_products SET status = 'HIDDEN' WHERE id = ?`, 'prod-gin']])
      const till = tillRead(database)
      expect([...till.options.keys()]).toEqual([])
      expect([...till.sizes.keys()].sort()).toEqual(['var-crisps', 'var-negroni'])
    })
  })

  // 0006 from the second direction again: the options widen the read without binding anything.
  test('the read still binds no parameter, however many options there are', async () => {
    await withDatabase((database) => {
      withSoda(database)
      const [, ...parameters] = boundStatement(database, tillServingsQuery())
      expect(parameters).toEqual([])
    })
  })
})

describe('the stock is counted once a stocktake has been applied (F-128 criterion 8, 0080)', () => {
  function counted(database: TestDatabase): boolean {
    const [statement, ...parameters] = boundStatement(database, STOCK_COUNTED_QUERY)
    return Number(rows<{ counted: number }>(database, statement, ...parameters)[0]?.counted) === 1
  }

  test('with no stocktake the balance is not yet trusted', async () => {
    await withDatabase((database) => {
      bar(database)
      delivery(database, 'item-gin', 700)
      expect(counted(database)).toBe(false)
    })
  })

  test('a stocktake still open has not set anything', async () => {
    await withDatabase((database) => {
      bar(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'OPEN', opened_by: 'user-1', opened_at: 1000 })
      expect(counted(database)).toBe(false)
    })
  })

  test('an applied stocktake is the cutover count', async () => {
    await withDatabase((database) => {
      bar(database)
      insert(database, 'stocktakes', { id: 'st-1', status: 'APPLIED', opened_by: 'user-1', opened_at: 1000, applied_by: 'user-1', applied_at: 2000 })
      expect(counted(database)).toBe(true)
    })
  })
})

// Issue 1299, F-106 and F-111 criterion 6: a wine set up through either form went on the till
// without Check ID, so the catalogue answers which products pour restricted stock without it.
describe('the products that pour restricted stock without Check ID (issue 1299)', () => {
  function catalogue(database: TestDatabase): void {
    insert(database, 'users', { id: 'user-1', email: 'manager@newtheatre.org.uk', name: 'Bar manager' })
    insert(database, 'bar_categories', { id: 'cat-1', name: 'Wine' })
    insert(database, 'bar_items', { id: 'item-merlot', name: 'Merlot 750ml', unit: 'ML', container_ml: 750, age_restricted: 1 })
    insert(database, 'bar_items', { id: 'item-vodka', name: 'Vodka 700ml', unit: 'ML', container_ml: 700, age_restricted: 1 })
    insert(database, 'bar_items', { id: 'item-cola', name: 'Cola can', unit: 'ITEM', age_restricted: 0 })

    const product = (id: string, name: string, over: Record<string, unknown> = {}): void =>
      insert(database, 'bar_products', { id, category_id: 'cat-1', name, status: 'ACTIVE', age_restricted: 0, ...over })
    const size = (id: string, productId: string, over: Record<string, unknown> = {}): void =>
      insert(database, 'product_variants', { id, product_id: productId, serving_kind: 'item', label: 'Each', ...over })

    product('prod-review-merlot', 'Review Merlot')
    size('var-review-merlot', 'prod-review-merlot', { serving_kind: '175ml', label: '175ml' })
    insert(database, 'variant_components', { id: 'c-1', variant_id: 'var-review-merlot', item_id: 'item-merlot', qty: 175 })

    product('prod-house-red', 'House red', { age_restricted: 1 })
    size('var-house-red', 'prod-house-red')
    insert(database, 'variant_components', { id: 'c-2', variant_id: 'var-house-red', item_id: 'item-merlot', qty: 750 })

    product('prod-cola', 'Cola')
    size('var-cola', 'prod-cola')
    insert(database, 'variant_components', { id: 'c-3', variant_id: 'var-cola', item_id: 'item-cola', qty: 1 })

    // A cola offering a shot of vodka as its choice pours vodka whenever the shot is chosen.
    insert(database, 'choice_groups', { id: 'group-shot', name: 'Add a shot' })
    insert(database, 'choice_group_items', { id: 'gi-1', choice_group_id: 'group-shot', item_id: 'item-vodka', qty: 25 })
    product('prod-spiked', 'Spiked cola', { status: 'HIDDEN' })
    size('var-spiked', 'prod-spiked')
    insert(database, 'variant_components', { id: 'c-4', variant_id: 'var-spiked', item_id: 'item-cola', qty: 1 })
    insert(database, 'variant_components', { id: 'c-5', variant_id: 'var-spiked', choice_group_id: 'group-shot', qty: 1 })

    product('prod-old-merlot', 'Old Merlot', { status: 'RETIRED' })
    size('var-old-merlot', 'prod-old-merlot')
    insert(database, 'variant_components', { id: 'c-6', variant_id: 'var-old-merlot', item_id: 'item-merlot', qty: 750 })

    product('prod-carafe', 'Carafe')
    size('var-carafe', 'prod-carafe', { status: 'RETIRED' })
    insert(database, 'variant_components', { id: 'c-7', variant_id: 'var-carafe', item_id: 'item-merlot', qty: 500 })
  }

  function restrictedPours(database: TestDatabase, productId: string): string[] {
    const [statement, ...parameters] = boundStatement(database, restrictedPoursColumn('p'))
    const [row] = rows<{ pours: string }>(database,
      `SELECT ${statement} AS pours FROM bar_products p WHERE p.id = ?`, ...parameters, productId)
    return readRestrictedPours(row?.pours ?? null)
  }

  function withoutCheckId(database: TestDatabase): string[] {
    const [statement, ...parameters] = boundStatement(database, withoutCheckIdPredicate('p'))
    return rows<{ id: string }>(database,
      `SELECT p.id AS id FROM bar_products p WHERE ${statement} ORDER BY p.name`, ...parameters).map(row => row.id)
  }

  function held(database: TestDatabase, productId: string, ageRestricted: boolean): boolean {
    const [statement, ...parameters] = boundStatement(database, checkIdHeld(productId, ageRestricted))
    return Number(rows<{ held: number }>(database, `SELECT ${statement} AS held`, ...parameters)[0]?.held) === 1
  }

  test('a product names the restricted stocked items its live sizes pour', async () => {
    await withDatabase((database) => {
      catalogue(database)
      expect(restrictedPours(database, 'prod-review-merlot')).toEqual(['Merlot 750ml'])
      expect(restrictedPours(database, 'prod-cola')).toEqual([])
    })
  })

  test('an item offered as a choice is poured by the product offering it', async () => {
    await withDatabase((database) => {
      catalogue(database)
      expect(restrictedPours(database, 'prod-spiked')).toEqual(['Vodka 700ml'])
    })
  })

  test('a retired size pours nothing', async () => {
    await withDatabase((database) => {
      catalogue(database)
      expect(restrictedPours(database, 'prod-carafe')).toEqual([])
    })
  })

  // Hidden counts: a hidden product goes back on the till with one press, and would sell without
  // Check ID the moment it did.
  test('the correction list holds every unretired product pouring restricted stock unrestricted', async () => {
    await withDatabase((database) => {
      catalogue(database)
      expect(withoutCheckId(database)).toEqual(['prod-review-merlot', 'prod-spiked'])
    })
  })

  test('switching the product on, or the stocked item off, takes it off the list', async () => {
    await withDatabase((database) => {
      catalogue(database)
      database.batch([
        [`UPDATE bar_products SET age_restricted = 1 WHERE id = 'prod-review-merlot'`],
        [`UPDATE bar_items SET age_restricted = 0 WHERE id = 'item-vodka'`],
      ])
      expect(withoutCheckId(database)).toEqual([])
    })
  })

  test('saving a product unrestricted holds only where it pours nothing restricted', async () => {
    await withDatabase((database) => {
      catalogue(database)
      expect(held(database, 'prod-review-merlot', false)).toBe(false)
      expect(held(database, 'prod-review-merlot', true)).toBe(true)
      expect(held(database, 'prod-cola', false)).toBe(true)
      expect(held(database, 'prod-spiked', false)).toBe(false)
    })
  })

  // 0006: both read over the rows they are given and bind nothing per product or item.
  test('neither the cell nor the list binds a parameter', async () => {
    await withDatabase((database) => {
      catalogue(database)
      const [, ...cell] = boundStatement(database, restrictedPoursColumn('p'))
      const [, ...list] = boundStatement(database, withoutCheckIdPredicate('p'))
      expect(cell).toEqual([])
      expect(list).toEqual([])
    })
  })
})
