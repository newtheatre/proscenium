// The bar: a catalogue with categories, variants and recipes, stock that has actually moved, a
// stocktake applied and another open, and a till session for tonight and one already closed.

import { londonDayOf } from '../../shared/utils/ledger'
import { ensure, holds, insert, insertOnly, seedId } from './statements'
import { personIn } from './people'
import type { People } from './people'
import type { Programme } from './programme'
import type { BoundStatement, SeedTarget } from './statements'

const DAY = 86_400

interface SeedItem {
  slug: string
  name: string
  unit: 'ML' | 'ITEM'
  containerMl: number | null
  parQty: number | null
  ageRestricted: boolean
  allergenNotes: string | null
  unitCostPence: number
  caseSize: number
  status?: 'RETIRED'
}

// What the cellar holds, in the measure it is bought in: a spirit by the bottle in millilitres, a
// can by the case. The measure is fixed once stock has moved, which a trigger enforces (F-111).
const ITEMS: SeedItem[] = [
  { slug: 'gin', name: 'Gin', unit: 'ML', containerMl: 700, parQty: 2800, ageRestricted: true, allergenNotes: null, unitCostPence: 1400, caseSize: 6 },
  { slug: 'vodka', name: 'Vodka', unit: 'ML', containerMl: 700, parQty: 2800, ageRestricted: true, allergenNotes: null, unitCostPence: 1300, caseSize: 6 },
  { slug: 'rum', name: 'Dark rum', unit: 'ML', containerMl: 700, parQty: 1400, ageRestricted: true, allergenNotes: null, unitCostPence: 1500, caseSize: 6 },
  { slug: 'whisky', name: 'Whisky', unit: 'ML', containerMl: 700, parQty: 1400, ageRestricted: true, allergenNotes: null, unitCostPence: 1800, caseSize: 6 },
  { slug: 'tonic', name: 'Tonic water', unit: 'ML', containerMl: 1000, parQty: 6000, ageRestricted: false, allergenNotes: null, unitCostPence: 90, caseSize: 12 },
  { slug: 'lemonade', name: 'Lemonade', unit: 'ML', containerMl: 1000, parQty: 6000, ageRestricted: false, allergenNotes: null, unitCostPence: 90, caseSize: 12 },
  { slug: 'cola', name: 'Cola', unit: 'ML', containerMl: 1000, parQty: 6000, ageRestricted: false, allergenNotes: null, unitCostPence: 95, caseSize: 12 },
  { slug: 'orange-juice', name: 'Orange juice', unit: 'ML', containerMl: 1000, parQty: 3000, ageRestricted: false, allergenNotes: null, unitCostPence: 120, caseSize: 8 },
  { slug: 'house-red', name: 'House red', unit: 'ML', containerMl: 750, parQty: 3000, ageRestricted: true, allergenNotes: 'Contains sulphites.', unitCostPence: 650, caseSize: 6 },
  { slug: 'house-white', name: 'House white', unit: 'ML', containerMl: 750, parQty: 3000, ageRestricted: true, allergenNotes: 'Contains sulphites.', unitCostPence: 650, caseSize: 6 },
  { slug: 'prosecco', name: 'Prosecco', unit: 'ML', containerMl: 750, parQty: 1500, ageRestricted: true, allergenNotes: 'Contains sulphites.', unitCostPence: 800, caseSize: 6 },
  { slug: 'lager', name: 'Lager', unit: 'ITEM', containerMl: null, parQty: 72, ageRestricted: true, allergenNotes: 'Contains barley (gluten).', unitCostPence: 90, caseSize: 24 },
  { slug: 'ale', name: 'Pale ale', unit: 'ITEM', containerMl: null, parQty: 48, ageRestricted: true, allergenNotes: 'Contains barley (gluten).', unitCostPence: 130, caseSize: 24 },
  { slug: 'cider', name: 'Cider', unit: 'ITEM', containerMl: null, parQty: 48, ageRestricted: true, allergenNotes: null, unitCostPence: 120, caseSize: 24 },
  { slug: 'alcohol-free-lager', name: 'Alcohol-free lager', unit: 'ITEM', containerMl: null, parQty: 24, ageRestricted: false, allergenNotes: 'Contains barley (gluten).', unitCostPence: 100, caseSize: 24 },
  { slug: 'crisps', name: 'Crisps', unit: 'ITEM', containerMl: null, parQty: 60, ageRestricted: false, allergenNotes: 'May contain milk.', unitCostPence: 30, caseSize: 48 },
  { slug: 'chocolate', name: 'Chocolate bar', unit: 'ITEM', containerMl: null, parQty: 40, ageRestricted: false, allergenNotes: 'Contains milk, soya and may contain nuts.', unitCostPence: 45, caseSize: 48 },
  // Retired, so the catalogue screen shows the state and the history that names it survives.
  { slug: 'alcopop', name: 'Alcopop', unit: 'ITEM', containerMl: null, parQty: null, ageRestricted: true, allergenNotes: null, unitCostPence: 110, caseSize: 24, status: 'RETIRED' },
]

interface SeedVariant {
  slug: string
  servingKind: string
  label: string
  // Left out on one variant per category, so the category default is what resolves it (F-121).
  pricePence?: number
  recipe?: { item: string, qty: number }
  choice?: string
  status?: 'RETIRED'
}

interface SeedProduct {
  slug: string
  name: string
  category: string
  status: 'ACTIVE' | 'HIDDEN' | 'RETIRED'
  ageRestricted: boolean
  allergenState: 'UNKNOWN' | 'NONE' | 'RECORDED'
  allergenNote?: string
  staffedOnly?: true
  variants: SeedVariant[]
}

const CATEGORIES: { slug: string, name: string, sort: number, colour: string | null }[] = [
  { slug: 'spirits', name: 'Spirits', sort: 0, colour: '#7c3aed' },
  { slug: 'wine', name: 'Wine', sort: 1, colour: '#be123c' },
  { slug: 'beer', name: 'Beer and cider', sort: 2, colour: '#a16207' },
  { slug: 'soft', name: 'Soft drinks', sort: 3, colour: '#0e7490' },
  { slug: 'snacks', name: 'Snacks', sort: 4, colour: null },
]

// Every spirit is the same price as a single and as a double, which is what a category price is
// for: the doubles below that differ carry a price row of their own (0017, F-121).
const CATEGORY_PRICES: { category: string, servingKind: string, pricePence: number }[] = [
  { category: 'spirits', servingKind: 'single', pricePence: 250 },
  { category: 'spirits', servingKind: 'double', pricePence: 400 },
  { category: 'soft', servingKind: 'glass', pricePence: 120 },
]

const CHOICE_GROUPS: { slug: string, name: string, options: { item: string, qty: number }[] }[] = [
  { slug: 'mixers', name: 'Mixers', options: [{ item: 'tonic', qty: 100 }, { item: 'lemonade', qty: 100 }, { item: 'cola', qty: 100 }, { item: 'orange-juice', qty: 100 }] },
]

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'gin',
    name: 'Gin',
    category: 'spirits',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'NONE',
    variants: [
      { slug: 'single', servingKind: 'single', label: 'Single', recipe: { item: 'gin', qty: 25 }, choice: 'mixers' },
      { slug: 'double', servingKind: 'double', label: 'Double', pricePence: 450, recipe: { item: 'gin', qty: 50 }, choice: 'mixers' },
    ],
  },
  {
    slug: 'vodka',
    name: 'Vodka',
    category: 'spirits',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'NONE',
    variants: [
      { slug: 'single', servingKind: 'single', label: 'Single', recipe: { item: 'vodka', qty: 25 }, choice: 'mixers' },
      { slug: 'double', servingKind: 'double', label: 'Double', recipe: { item: 'vodka', qty: 50 }, choice: 'mixers' },
    ],
  },
  {
    slug: 'rum',
    name: 'Dark rum',
    category: 'spirits',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'NONE',
    variants: [
      { slug: 'single', servingKind: 'single', label: 'Single', recipe: { item: 'rum', qty: 25 }, choice: 'mixers' },
      { slug: 'double', servingKind: 'double', label: 'Double', recipe: { item: 'rum', qty: 50 }, choice: 'mixers' },
    ],
  },
  {
    slug: 'whisky',
    name: 'Whisky',
    category: 'spirits',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'UNKNOWN',
    variants: [
      { slug: 'single', servingKind: 'single', label: 'Single', recipe: { item: 'whisky', qty: 25 } },
      { slug: 'double', servingKind: 'double', label: 'Double', pricePence: 500, recipe: { item: 'whisky', qty: 50 } },
    ],
  },
  {
    slug: 'house-red',
    name: 'House red',
    category: 'wine',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'RECORDED',
    allergenNote: 'Contains sulphites.',
    variants: [
      { slug: '175', servingKind: '175ml', label: '175ml glass', pricePence: 350, recipe: { item: 'house-red', qty: 175 } },
      { slug: '250', servingKind: '250ml', label: '250ml glass', pricePence: 480, recipe: { item: 'house-red', qty: 250 } },
      { slug: 'bottle', servingKind: 'bottle', label: 'Bottle', pricePence: 1400, recipe: { item: 'house-red', qty: 750 } },
    ],
  },
  {
    slug: 'house-white',
    name: 'House white',
    category: 'wine',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'RECORDED',
    allergenNote: 'Contains sulphites.',
    variants: [
      { slug: '175', servingKind: '175ml', label: '175ml glass', pricePence: 350, recipe: { item: 'house-white', qty: 175 } },
      { slug: 'bottle', servingKind: 'bottle', label: 'Bottle', pricePence: 1400, recipe: { item: 'house-white', qty: 750 } },
    ],
  },
  {
    slug: 'prosecco',
    name: 'Prosecco',
    category: 'wine',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'RECORDED',
    allergenNote: 'Contains sulphites.',
    // Poured by a trained member rather than self-served, which is what staffed-only means.
    staffedOnly: true,
    variants: [
      { slug: 'bottle', servingKind: 'bottle', label: 'Bottle', pricePence: 1600, recipe: { item: 'prosecco', qty: 750 } },
    ],
  },
  {
    slug: 'lager',
    name: 'Lager',
    category: 'beer',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'RECORDED',
    allergenNote: 'Contains barley (gluten).',
    variants: [{ slug: 'can', servingKind: 'can', label: 'Can', pricePence: 250, recipe: { item: 'lager', qty: 1 } }],
  },
  {
    slug: 'ale',
    name: 'Pale ale',
    category: 'beer',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'RECORDED',
    allergenNote: 'Contains barley (gluten).',
    variants: [{ slug: 'can', servingKind: 'can', label: 'Can', pricePence: 320, recipe: { item: 'ale', qty: 1 } }],
  },
  {
    slug: 'cider',
    name: 'Cider',
    category: 'beer',
    status: 'ACTIVE',
    ageRestricted: true,
    allergenState: 'NONE',
    variants: [{ slug: 'can', servingKind: 'can', label: 'Can', pricePence: 300, recipe: { item: 'cider', qty: 1 } }],
  },
  {
    slug: 'alcohol-free-lager',
    name: 'Alcohol-free lager',
    category: 'beer',
    status: 'ACTIVE',
    ageRestricted: false,
    allergenState: 'RECORDED',
    allergenNote: 'Contains barley (gluten).',
    variants: [{ slug: 'can', servingKind: 'can', label: 'Can', pricePence: 220, recipe: { item: 'alcohol-free-lager', qty: 1 } }],
  },
  {
    slug: 'soft-drink',
    name: 'Soft drink',
    category: 'soft',
    status: 'ACTIVE',
    ageRestricted: false,
    allergenState: 'NONE',
    variants: [
      { slug: 'glass', servingKind: 'glass', label: 'Glass', choice: 'mixers' },
      { slug: 'large', servingKind: 'large', label: 'Large glass', pricePence: 180, choice: 'mixers' },
    ],
  },
  {
    slug: 'crisps',
    name: 'Crisps',
    category: 'snacks',
    status: 'ACTIVE',
    ageRestricted: false,
    allergenState: 'RECORDED',
    allergenNote: 'May contain milk.',
    variants: [{ slug: 'bag', servingKind: 'bag', label: 'Bag', pricePence: 100, recipe: { item: 'crisps', qty: 1 } }],
  },
  {
    slug: 'chocolate',
    name: 'Chocolate bar',
    category: 'snacks',
    status: 'ACTIVE',
    ageRestricted: false,
    allergenState: 'RECORDED',
    allergenNote: 'Contains milk, soya and may contain nuts.',
    variants: [{ slug: 'bar', servingKind: 'bar', label: 'Bar', pricePence: 110, recipe: { item: 'chocolate', qty: 1 } }],
  },
  {
    slug: 'mulled-wine',
    name: 'Mulled wine',
    category: 'wine',
    // Hidden rather than retired: it comes back every December (F-112).
    status: 'HIDDEN',
    ageRestricted: true,
    allergenState: 'RECORDED',
    allergenNote: 'Contains sulphites.',
    variants: [{ slug: 'mug', servingKind: 'mug', label: 'Mug', pricePence: 300, recipe: { item: 'house-red', qty: 200 } }],
  },
  {
    slug: 'alcopop',
    name: 'Alcopop',
    category: 'beer',
    status: 'RETIRED',
    ageRestricted: true,
    allergenState: 'UNKNOWN',
    variants: [{ slug: 'bottle', servingKind: 'bottle', label: 'Bottle', pricePence: 280, recipe: { item: 'alcopop', qty: 1 }, status: 'RETIRED' }],
  },
]

export interface Bar {
  items: Map<string, string>
  variants: Map<string, { id: string, price: number, name: string }>
  tillSessions: { tonight: string, closed: string }
  counts: { categories: number, products: number, variants: number, items: number, movements: number, stocktakes: number }
}

export function seedBar(target: SeedTarget, people: People, programme: Programme, now: number): Bar {
  const keeper = personIn(people, 'devon').id
  const manager = personIn(people, 'rowan').id
  const today = londonDayOf(new Date(now * 1000))
  const statements: BoundStatement[] = []

  const items = new Map<string, string>()
  for (const item of ITEMS) {
    items.set(item.slug, ensure(target, 'bar_items', { column: 'name', value: item.name }, {
      id: seedId('baritem', item.slug),
      name: item.name,
      unit: item.unit,
      container_ml: item.containerMl,
      par_qty: item.parQty,
      age_restricted: item.ageRestricted ? 1 : 0,
      allergen_notes: item.allergenNotes,
      status: item.status ?? 'ACTIVE',
    }).id)
  }

  const categories = new Map<string, string>()
  for (const category of CATEGORIES) {
    categories.set(category.slug, ensure(target, 'bar_categories', { column: 'name', value: category.name }, {
      id: seedId('barcategory', category.slug),
      name: category.name,
      sort: category.sort,
      colour: category.colour,
    }).id)
  }

  const groups = new Map<string, string>()
  for (const group of CHOICE_GROUPS) {
    const id = ensure(target, 'choice_groups', { column: 'name', value: group.name }, {
      id: seedId('choicegroup', group.slug),
      name: group.name,
    }).id
    groups.set(group.slug, id)
    for (const [sort, option] of group.options.entries()) {
      statements.push(insert('choice_group_items', {
        id: seedId('choiceitem', group.slug, option.item),
        choice_group_id: id,
        item_id: items.get(option.item)!,
        qty: option.qty,
        sort,
      }))
    }
  }

  const variants = new Map<string, { id: string, price: number, name: string }>()
  for (const [sort, product] of PRODUCTS.entries()) {
    const productId = ensure(target, 'bar_products', { column: 'name', value: product.name }, {
      id: seedId('barproduct', product.slug),
      category_id: categories.get(product.category)!,
      name: product.name,
      status: product.status,
      staffed_only: product.staffedOnly ? 1 : 0,
      age_restricted: product.ageRestricted ? 1 : 0,
      allergen_state: product.allergenState,
      allergen_note: product.allergenNote ?? null,
      sort,
    }).id

    for (const [variantSort, variant] of product.variants.entries()) {
      const id = seedId('barvariant', product.slug, variant.slug)
      statements.push(insert('product_variants', {
        id,
        product_id: productId,
        serving_kind: variant.servingKind,
        label: variant.label,
        status: variant.status ?? 'ACTIVE',
        sort: variantSort,
      }))

      if (variant.recipe) {
        statements.push(insert('variant_components', {
          id: seedId('barcomponent', product.slug, variant.slug, variant.recipe.item),
          variant_id: id,
          item_id: items.get(variant.recipe.item)!,
          qty: variant.recipe.qty,
          included_in_price: 1,
        }))
      }
      if (variant.choice) {
        statements.push(insert('variant_components', {
          id: seedId('barchoice', product.slug, variant.slug, variant.choice),
          variant_id: id,
          choice_group_id: groups.get(variant.choice)!,
          qty: 1,
          included_in_price: 1,
        }))
      }

      variants.set(`${product.slug}/${variant.slug}`, {
        id,
        price: variant.pricePence ?? categoryPriceOf(product.category, variant.servingKind),
        name: `${product.name}, ${variant.label.toLowerCase()}`,
      })
    }
  }

  target.batch(statements)

  seedPrices(target, categories, variants, today, manager)
  const movements = seedStock(target, items, keeper, now)
  const stocktakes = seedStocktakes(target, items, people, now)
  const tillSessions = seedTillSessions(target, people, programme, now)
  seedCompRequests(target, people, programme, variants, now)

  return {
    items,
    variants,
    tillSessions,
    counts: {
      categories: CATEGORIES.length,
      products: PRODUCTS.length,
      variants: variants.size,
      items: ITEMS.length,
      movements,
      stocktakes,
    },
  }
}

function categoryPriceOf(category: string, servingKind: string): number {
  const found = CATEGORY_PRICES.find(price => price.category === category && price.servingKind === servingKind)
  return found?.pricePence ?? 0
}

// Prices are an append-only register keyed by the day they take effect, so a re-run asks before it
// writes rather than stacking a second row on the same day (0010, F-116).
function seedPrices(
  target: SeedTarget,
  categories: Map<string, string>,
  variants: Map<string, { id: string, price: number, name: string }>,
  today: string,
  by: string,
): void {
  const statements: BoundStatement[] = []

  for (const price of CATEGORY_PRICES) {
    const categoryId = categories.get(price.category)!
    if (holds(target, 'category_prices', { category_id: categoryId, serving_kind: price.servingKind, effective_from: today })) continue
    statements.push(insertOnly('category_prices', {
      id: seedId('categoryprice', price.category, price.servingKind),
      category_id: categoryId,
      serving_kind: price.servingKind,
      price_pence: price.pricePence,
      effective_from: today,
      created_by: by,
    }))
  }

  for (const product of PRODUCTS) {
    for (const variant of product.variants) {
      if (variant.pricePence === undefined) continue
      const variantId = variants.get(`${product.slug}/${variant.slug}`)!.id
      if (holds(target, 'variant_prices', { variant_id: variantId, effective_from: today })) continue
      statements.push(insertOnly('variant_prices', {
        id: seedId('variantprice', product.slug, variant.slug),
        variant_id: variantId,
        price_pence: variant.pricePence,
        effective_from: today,
        created_by: by,
      }))
    }
  }

  if (statements.length) target.batch(statements)
}

// A delivery of everything, then the movements that make on-hand a real number rather than a full
// case of each: a sale, a wastage with its reason, an adjustment, and one reversal.
function seedStock(target: SeedTarget, items: Map<string, string>, keeper: string, now: number): number {
  const statements: BoundStatement[] = []
  let movements = 0

  for (const item of ITEMS) {
    const itemId = items.get(item.slug)!
    const delivered = (item.unit === 'ML' ? item.containerMl! : 1) * item.caseSize

    const deliveryId = seedId('movement', item.slug, 'delivery')
    if (!holds(target, 'stock_movements', { id: deliveryId })) {
      statements.push(insertOnly('stock_movements', {
        id: deliveryId,
        item_id: itemId,
        qty: delivered,
        kind: 'DELIVERY',
        unit_cost_pence: item.unitCostPence,
        actor_id: keeper,
        created_at: now - 20 * DAY,
      }))
      movements++
    }

    // A quarter of the case gone, so nothing reads as untouched and nothing goes negative.
    const soldId = seedId('movement', item.slug, 'sale')
    if (item.status !== 'RETIRED' && !holds(target, 'stock_movements', { id: soldId })) {
      statements.push(insertOnly('stock_movements', {
        id: soldId,
        item_id: itemId,
        qty: -Math.max(1, Math.floor(delivered / 4)),
        kind: 'SALE',
        actor_id: keeper,
        created_at: now - 7 * DAY,
      }))
      movements++
    }
  }

  const wastageId = seedId('movement', 'house-red', 'wastage')
  if (!holds(target, 'stock_movements', { id: wastageId })) {
    statements.push(insertOnly('stock_movements', {
      id: wastageId,
      item_id: items.get('house-red')!,
      qty: -750,
      kind: 'WASTAGE',
      reason: 'A bottle went over behind the bar during the get-in.',
      actor_id: keeper,
      created_at: now - 5 * DAY,
    }))
    movements++
  }

  const adjustId = seedId('movement', 'crisps', 'adjust')
  if (!holds(target, 'stock_movements', { id: adjustId })) {
    statements.push(insertOnly('stock_movements', {
      id: adjustId,
      item_id: items.get('crisps')!,
      qty: -6,
      kind: 'ADJUST',
      reason: 'Six bags out of date and binned.',
      actor_id: keeper,
      created_at: now - 4 * DAY,
    }))
    movements++
  }

  // A reversal cancels exactly the movement it names, same item and opposite quantity, which a
  // trigger enforces rather than trusts (F-114).
  const reversedId = seedId('movement', 'lemonade', 'miscount')
  const reversalId = seedId('movement', 'lemonade', 'reversal')
  if (!holds(target, 'stock_movements', { id: reversedId })) {
    statements.push(insertOnly('stock_movements', {
      id: reversedId,
      item_id: items.get('lemonade')!,
      qty: -2000,
      kind: 'ADJUST',
      reason: 'Recorded against the wrong bottle.',
      actor_id: keeper,
      created_at: now - 3 * DAY,
    }))
    statements.push(insertOnly('stock_movements', {
      id: reversalId,
      item_id: items.get('lemonade')!,
      qty: 2000,
      kind: 'REVERSAL',
      reason: 'Reversing the miscount above.',
      reverses_id: reversedId,
      actor_id: keeper,
      created_at: now - 3 * DAY + 600,
    }))
    movements += 2
  }

  if (statements.length) target.batch(statements)
  return movements
}

// One applied, so the stock screens have a count behind them, and one open, because a stocktake
// half done is the state somebody walks back into. Only one may be open at a time.
function seedStocktakes(target: SeedTarget, items: Map<string, string>, people: People, now: number): number {
  const keeper = personIn(people, 'devon').id
  const statements: BoundStatement[] = []
  const counted = ['gin', 'vodka', 'house-red', 'lager', 'crisps']

  const appliedId = seedId('stocktake', 'applied')
  if (!holds(target, 'stocktakes', { id: appliedId })) {
    statements.push(insert('stocktakes', {
      id: appliedId,
      status: 'APPLIED',
      opened_by: keeper,
      opened_at: now - 14 * DAY,
      applied_by: keeper,
      applied_at: now - 14 * DAY + 3600,
    }))
    for (const slug of counted) {
      statements.push(insert('stocktake_lines', {
        id: seedId('stocktakeline', 'applied', slug),
        stocktake_id: appliedId,
        item_id: items.get(slug)!,
        expected_qty: 100,
        counted_qty: 98,
      }))
    }
  }

  const openId = seedId('stocktake', 'open')
  if (!holds(target, 'stocktakes', { status: 'OPEN' })) {
    statements.push(insert('stocktakes', {
      id: openId,
      status: 'OPEN',
      opened_by: keeper,
      opened_at: now - 2 * 3600,
      applied_by: null,
      applied_at: null,
    }))
    for (const [index, slug] of counted.entries()) {
      statements.push(insert('stocktake_lines', {
        id: seedId('stocktakeline', 'open', slug),
        stocktake_id: openId,
        item_id: items.get(slug)!,
        expected_qty: 100,
        // Half counted, half still to do, which is what an open stocktake looks like.
        counted_qty: index < 3 ? 96 : null,
      }))
    }
  }

  if (statements.length) target.batch(statements)
  return 2
}

function seedTillSessions(target: SeedTarget, people: People, programme: Programme, now: number): { tonight: string, closed: string } {
  const house = programme.venues.get('house')!
  const keeper = personIn(people, 'devon').id
  const tonight = programme.performances.get('the-seagull/tonight')!.night
  const past = programme.performances.get('the-seagull/past')!.night

  const openId = seedId('tillsession', tonight)
  const closedId = seedId('tillsession', past)

  target.batch([
    insert('till_sessions', {
      id: openId,
      venue_id: house,
      night: tonight,
      opened_by: keeper,
      opened_at: now - 3 * 3600,
      closed_by: null,
      closed_at: null,
    }),
    insert('till_sessions', {
      id: closedId,
      venue_id: house,
      night: past,
      opened_by: keeper,
      opened_at: now - 6 * DAY - 3 * 3600,
      closed_by: keeper,
      closed_at: now - 6 * DAY + 3600,
    }),
  ])

  return { tonight: openId, closed: closedId }
}

// Every status, and never decided by the person who asked: giving away value takes more than the
// access that lets you sell (F-110).
function seedCompRequests(
  target: SeedTarget,
  people: People,
  programme: Programme,
  variants: Map<string, { id: string, price: number, name: string }>,
  now: number,
): void {
  const house = programme.venues.get('house')!
  const tonight = programme.performances.get('the-seagull/tonight')!.night
  const requester = personIn(people, 'devon').id
  const manager = personIn(people, 'rowan').id
  const lager = variants.get('lager/can')!

  const lines = JSON.stringify([{ variantId: lager.id, label: lager.name, qty: 2, unitPricePence: lager.price }])

  target.batch([
    insert('comp_requests', {
      id: seedId('comprequest', 'pending'),
      venue_id: house,
      night: tonight,
      requested_by: requester,
      reason: 'The stage manager has been here since nine this morning.',
      lines,
      status: 'PENDING',
      decided_by: null,
      decided_at: null,
      decline_reason: null,
      created_at: now - 1800,
    }),
    insert('comp_requests', {
      id: seedId('comprequest', 'approved'),
      venue_id: house,
      night: tonight,
      requested_by: requester,
      reason: 'Replacing a drink knocked over by a member of the door team.',
      lines,
      status: 'APPROVED',
      decided_by: manager,
      decided_at: now - 3600,
      decline_reason: null,
      created_at: now - 4200,
    }),
    insert('comp_requests', {
      id: seedId('comprequest', 'declined'),
      venue_id: house,
      night: tonight,
      requested_by: requester,
      reason: 'A round for the cast after the show.',
      lines,
      status: 'DECLINED',
      decided_by: manager,
      decided_at: now - 5400,
      decline_reason: 'Not a comp: put it on the production tab and settle it at the end of the run.',
      created_at: now - 6000,
    }),
  ])
}
