import { describe, expect, test } from 'bun:test'
import { planProductSetup } from '#server/utils/bar-setup'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'
import type { SetupContext, SetupPlan } from '#server/utils/bar-setup'
import type { ProductSetupInput } from '#shared/utils/bar'
import type { TestDatabase } from '#tests/helpers/database'

// F-127 on the real migrations: one submission writes the stocked item, the product, its sizes,
// its recipe, its choice group and its opening prices, or it writes nothing at all (0001, 0003).

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

function bar(database: TestDatabase): void {
  insert(database, 'users', { id: 'user-1', email: 'manager@newtheatre.org.uk', name: 'Bar manager' })
  insert(database, 'bar_categories', { id: 'cat-wine', name: 'Wine', sort: 20 })
  insert(database, 'bar_categories', { id: 'cat-cans', name: 'Cans and bottles', sort: 10 })
  insert(database, 'bar_categories', { id: 'cat-cocktails', name: 'Cocktails', sort: 30 })
}

// Ids a test can read back, in the order the plan asks for them. One counter for the file, so a
// second set-up in one test never reuses the first's ids.
let next = 0
const ids = () => () => `new-${++next}`

const context = (over: Partial<SetupContext> = {}): SetupContext => ({
  actorId: 'user-1',
  today: '2026-09-15',
  pricedKinds: [],
  retiredItems: [],
  newId: ids(),
  ...over,
})

function apply(database: TestDatabase, plan: SetupPlan): void {
  database.batch(plan.statements.map(statement => boundStatement(database, statement as SQL)))
}

type Simple = Extract<ProductSetupInput, { shape: 'SIMPLE' }>

const CIDER: Simple = {
  shape: 'SIMPLE',
  product: {
    name: 'Cider',
    categoryId: 'cat-cans',
    sort: 0,
    staffedOnly: false,
    ageRestricted: true,
    allergenState: 'NONE',
    allergenNote: null,
  },
  item: { mode: 'NEW', item: { name: 'Cider 440ml can', unit: 'ITEM', ageRestricted: true } },
  serving: { servingKind: 'can', label: 'Can', qty: 1, pricePence: 300 },
  opening: null,
}

const HOUSE_RED: ProductSetupInput = {
  shape: 'MEASURED',
  product: {
    name: 'House red',
    categoryId: 'cat-wine',
    sort: 0,
    staffedOnly: false,
    ageRestricted: true,
    allergenState: 'RECORDED',
    allergenNote: 'Contains sulphites.',
  },
  item: { mode: 'NEW', item: { name: 'House red 750ml', unit: 'ML', containerMl: 750, ageRestricted: true } },
  sizes: [
    { servingKind: 'bottle', label: 'Bottle', qty: 750, pricePence: 1400 },
    { servingKind: '250ml', label: '250ml', qty: 250, pricePence: 500 },
    { servingKind: '175ml', label: '175ml', qty: 175, pricePence: 400 },
    { servingKind: '125ml', label: '125ml', qty: 125, pricePence: 300 },
  ],
  opening: null,
} as ProductSetupInput

const NEGRONI: ProductSetupInput = {
  shape: 'RECIPE',
  product: {
    name: 'Negroni',
    categoryId: 'cat-cocktails',
    sort: 0,
    staffedOnly: false,
    ageRestricted: true,
    allergenState: 'NONE',
    allergenNote: null,
  },
  serving: { servingKind: 'item', label: 'Each', pricePence: 600 },
  components: [
    { itemId: 'item-gin', qty: 25 },
    { itemId: 'item-campari', qty: 25 },
    { itemId: 'item-vermouth', qty: 25 },
  ],
  choice: {
    group: { name: 'Garnish', options: [{ itemId: 'item-orange', qty: 1 }, { itemId: 'item-lemon', qty: 1 }] },
    qty: 1,
    includedInPrice: true,
  },
} as ProductSetupInput

function spirits(database: TestDatabase): void {
  for (const [id, name] of [
    ['item-gin', 'Gin'], ['item-campari', 'Campari'], ['item-vermouth', 'Vermouth'],
    ['item-orange', 'Orange'], ['item-lemon', 'Lemon'],
  ] as const) {
    insert(database, 'bar_items', { id, name, unit: id.startsWith('item-o') || id.endsWith('lemon') ? 'ITEM' : 'ML' })
  }
}

describe('one submission sets up a whole product (F-127 criterion 4)', () => {
  test('a can is one item, one size, one depletion and one price', async () => {
    await withDatabase((database) => {
      bar(database)
      const plan = planProductSetup(CIDER, context())
      apply(database, plan)

      expect(rows(database, 'SELECT name, unit FROM bar_items')).toEqual([{ name: 'Cider 440ml can', unit: 'ITEM' }])
      expect(rows(database, 'SELECT name, status FROM bar_products')).toEqual([{ name: 'Cider', status: 'ACTIVE' }])
      expect(rows(database, 'SELECT serving_kind, label FROM product_variants'))
        .toEqual([{ serving_kind: 'can', label: 'Can' }])
      expect(rows(database, 'SELECT item_id, qty FROM variant_components'))
        .toEqual([{ item_id: plan.itemId, qty: 1 }])
      expect(rows(database, 'SELECT price_pence, effective_from FROM variant_prices'))
        .toEqual([{ price_pence: 300, effective_from: '2026-09-15' }])
    })
  })

  test('a wine is one bottle sold at four sizes, each depleting its own measure', async () => {
    await withDatabase((database) => {
      bar(database)
      const plan = planProductSetup(HOUSE_RED, context())
      apply(database, plan)

      expect(rows(database, 'SELECT container_ml FROM bar_items')).toEqual([{ container_ml: 750 }])
      expect(rows<{ serving_kind: string }>(database, 'SELECT serving_kind FROM product_variants ORDER BY sort')
        .map(row => row.serving_kind)).toEqual(['bottle', '250ml', '175ml', '125ml'])
      expect(rows<{ qty: number }>(database, `
        SELECT c.qty FROM variant_components c JOIN product_variants v ON v.id = c.variant_id ORDER BY v.sort
      `).map(row => row.qty)).toEqual([750, 250, 175, 125])
      expect(rows<{ price_pence: number }>(database, 'SELECT price_pence FROM variant_prices')
        .map(row => row.price_pence).sort((a, b) => a - b)).toEqual([300, 400, 500, 1400])
      expect(plan.status).toBe('ACTIVE')
    })
  })

  test('a cocktail depletes several items and offers its choice in the same submission', async () => {
    await withDatabase((database) => {
      bar(database)
      spirits(database)
      const plan = planProductSetup(NEGRONI, context())
      apply(database, plan)

      expect(rows(database, 'SELECT name FROM choice_groups')).toEqual([{ name: 'Garnish' }])
      expect(rows<{ item_id: string }>(database, 'SELECT item_id FROM choice_group_items ORDER BY sort')
        .map(row => row.item_id)).toEqual(['item-orange', 'item-lemon'])
      expect(rows<{ item_id: string | null, choice_group_id: string | null, included_in_price: number }>(database, `
        SELECT item_id, choice_group_id, included_in_price FROM variant_components ORDER BY item_id
      `)).toEqual([
        { item_id: null, choice_group_id: plan.choiceGroupId, included_in_price: 1 },
        { item_id: 'item-campari', choice_group_id: null, included_in_price: 0 },
        { item_id: 'item-gin', choice_group_id: null, included_in_price: 0 },
        { item_id: 'item-vermouth', choice_group_id: null, included_in_price: 0 },
      ])
    })
  })

  test('a stocked item already on the list is reused rather than created again', async () => {
    await withDatabase((database) => {
      bar(database)
      insert(database, 'bar_items', { id: 'item-cider', name: 'Cider 440ml can', unit: 'ITEM' })
      const plan = planProductSetup(
        { ...CIDER, item: { mode: 'EXISTING', itemId: 'item-cider' } } as ProductSetupInput,
        context(),
      )
      apply(database, plan)

      expect(plan.itemId).toBe('item-cider')
      expect(rows(database, 'SELECT count(*) AS n FROM bar_items')).toEqual([{ n: 1 }])
      expect(rows(database, 'SELECT item_id FROM variant_components')).toEqual([{ item_id: 'item-cider' }])
    })
  })

  test('an opening delivery arrives as one movement at the cost that was paid', async () => {
    await withDatabase((database) => {
      bar(database)
      const plan = planProductSetup(
        { ...CIDER, opening: { qty: 24, unitCostPence: 95 } } as ProductSetupInput,
        context(),
      )
      apply(database, plan)

      expect(rows(database, 'SELECT kind, qty, unit_cost_pence FROM stock_movements'))
        .toEqual([{ kind: 'DELIVERY', qty: 24, unit_cost_pence: 95 }])
    })
  })
})

describe('nothing partial survives a collision (F-127 criterion 4)', () => {
  test('a second set-up under a taken product name writes nothing at all', async () => {
    await withDatabase((database) => {
      bar(database)
      apply(database, planProductSetup(CIDER, context()))

      const again = planProductSetup(
        { ...CIDER, item: { mode: 'NEW', item: { name: 'Cider 440ml can (2)', unit: 'ITEM' } } } as ProductSetupInput,
        context(),
      )
      apply(database, again)

      expect(rows(database, 'SELECT count(*) AS n FROM bar_products')).toEqual([{ n: 1 }])
      expect(rows(database, 'SELECT count(*) AS n FROM product_variants')).toEqual([{ n: 1 }])
      expect(rows(database, 'SELECT count(*) AS n FROM variant_prices')).toEqual([{ n: 1 }])
      expect(rows(database, 'SELECT count(*) AS n FROM bar_items')).toEqual([{ n: 1 }])
    })
  })

  test('a second set-up under a taken stocked-item name writes nothing at all', async () => {
    await withDatabase((database) => {
      bar(database)
      apply(database, planProductSetup(CIDER, context()))

      const again = planProductSetup(
        { ...CIDER, product: { ...CIDER.product, name: 'Cider (draught)' } } as ProductSetupInput,
        context(),
      )
      apply(database, again)

      expect(rows(database, 'SELECT count(*) AS n FROM bar_products')).toEqual([{ n: 1 }])
      expect(rows(database, 'SELECT count(*) AS n FROM bar_items')).toEqual([{ n: 1 }])
    })
  })

  // 0003 and 0006: a statement binding more than the chunk limit is refused by D1 in production,
  // and the test sink refuses it here for the same reason.
  test('no statement in the batch binds more than the chunk limit', async () => {
    await withDatabase((database) => {
      bar(database)
      const plan = planProductSetup(HOUSE_RED, context())
      for (const statement of plan.statements) {
        const [, ...parameters] = boundStatement(database, statement as SQL)
        expect(parameters.length).toBeLessThanOrEqual(MAX_BOUND_PARAMETERS)
      }
    })
  })
})

describe('a product goes on the till only when every size resolves (F-127 criterion 5)', () => {
  test('a size the category already prices needs no price of its own', async () => {
    await withDatabase((database) => {
      bar(database)
      const plan = planProductSetup(
        { ...CIDER, serving: { ...CIDER.serving, pricePence: null } } as ProductSetupInput,
        context({ pricedKinds: ['can'] }),
      )
      apply(database, plan)

      expect(plan.status).toBe('ACTIVE')
      expect(plan.reason).toBe(null)
      expect(rows(database, 'SELECT count(*) AS n FROM variant_prices')).toEqual([{ n: 0 }])
    })
  })

  test('a size nothing prices leaves the product hidden, and the reason names the size', async () => {
    await withDatabase((database) => {
      bar(database)
      const plan = planProductSetup({
        ...HOUSE_RED,
        sizes: [
          { servingKind: 'bottle', label: 'Bottle', qty: 750, pricePence: 1400 },
          { servingKind: '175ml', label: '175ml', qty: 175, pricePence: null },
        ],
      } as ProductSetupInput, context())
      apply(database, plan)

      expect(plan.status).toBe('HIDDEN')
      expect(plan.reason).toContain('175ml')
      expect(rows(database, 'SELECT status FROM bar_products')).toEqual([{ status: 'HIDDEN' }])
    })
  })

  test('a recipe over a retired ingredient stays hidden, and the reason names the ingredient', async () => {
    await withDatabase((database) => {
      bar(database)
      spirits(database)
      const plan = planProductSetup(NEGRONI, context({ retiredItems: ['Campari'] }))
      apply(database, plan)

      expect(plan.status).toBe('HIDDEN')
      expect(plan.reason).toContain('Campari')
    })
  })
})

describe('every object created says so in the trail (F-127 criterion 4)', () => {
  test('one audit row per object, naming the object it is about', async () => {
    await withDatabase((database) => {
      bar(database)
      const plan = planProductSetup(HOUSE_RED, context())
      apply(database, plan)

      const actions = rows<{ action: string }>(database, 'SELECT action FROM audit_log ORDER BY action')
        .map(row => row.action)
      expect(actions.filter(action => action === 'bar.item.created')).toHaveLength(1)
      expect(actions.filter(action => action === 'bar.product.created')).toHaveLength(1)
      expect(actions.filter(action => action === 'bar.variant.created')).toHaveLength(4)
      expect(rows(database, 'SELECT count(*) AS n FROM audit_log WHERE actor_id IS NULL')).toEqual([{ n: 0 }])
    })
  })
})
