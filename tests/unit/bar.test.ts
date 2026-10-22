import { describe, expect, test } from 'bun:test'
import {
  saysMovementReason,
  HAND_ENTERED_KINDS,
  KINDS_NEEDING_A_REASON,
  MOVEMENT_WRITERS,
  REVERSIBLE_KINDS,
  STOCK_ITEM_AGE_RESTRICTED_DEFAULT,
  STOCK_MOVEMENT_KINDS,
  categoryForm,
  categoryPriceForm,
  DELIVERY_COST_QUESTION,
  componentsForm,
  deliveryCost,
  deriveAllergens,
  saysAllergens,
  saysAtTheTill,
  deliveryCostBasis,
  effectivePriceRow,
  firstUnreadable,
  packagedKindFor,
  stockItemAgeRestrictedFor,
  movementEntryForm,
  movementForm,
  priceRef,
  productForm,
  says,
  saysDeliveryCost,
  saysMoney,
  saysMovementAction,
  saysQuantity,
  saysStockStatus,
  priceForm,
  stockItemForm,
  stockStatus,
  variantEditForm,
  variantForm,
  writeOffSizes,
} from '#shared/utils/bar'
import { saysToOrder, toOrder } from '#shared/utils/ordering'
import type { AllergenState } from '#shared/utils/bar'

// F-111 and F-114's write-path rules, which the database CHECKs mirror rather than replace: a
// refusal has to say what is wrong before a constraint error would.

const aProduct = (over: Record<string, unknown> = {}) =>
  productForm.safeParse({ name: 'House red', categoryId: 'cat-1', ...over })

const aMovement = (over: Record<string, unknown> = {}) =>
  movementForm.safeParse({ itemId: 'item-1', kind: 'DELIVERY', qty: 750, ...over })

describe('the movement vocabulary is complete and each kind has an owner (F-114 criterion 3)', () => {
  test('every kind the story names is in the vocabulary', () => {
    for (const kind of ['DELIVERY', 'SALE', 'WASTAGE', 'TRANSFER', 'STOCKTAKE', 'REVERSAL']) {
      expect(`${kind}: ${(STOCK_MOVEMENT_KINDS as readonly string[]).includes(kind)}`).toBe(`${kind}: true`)
    }
  })

  test('every kind says which path writes it', () => {
    expect(STOCK_MOVEMENT_KINDS.filter(kind => !MOVEMENT_WRITERS[kind])).toEqual([])
  })

  // The stock screen writes what a person types in. A depletion belongs to the till, and posting
  // one by hand would leave a sale with no money beside it.
  test('the stock screen writes what a person types and nothing a sale posts', () => {
    expect([...HAND_ENTERED_KINDS]).toEqual(['DELIVERY', 'WASTAGE', 'ADJUST', 'REVERSAL'])
    for (const kind of ['SALE', 'COMP', 'STOCKTAKE', 'TRANSFER'] as const) {
      expect(`${kind}: ${HAND_ENTERED_KINDS.includes(kind)}`).toBe(`${kind}: false`)
    }
  })

  // Issue 1350 (F-114 criterion 4 as amended): reversing a sale or a comp put the stock back while
  // the money stayed in the ledger, so only a hand-entered row or a stocktake's is reversed.
  test('only a hand-entered row or a stocktake adjustment is reversed', () => {
    expect([...REVERSIBLE_KINDS]).toEqual(['DELIVERY', 'STOCKTAKE', 'WASTAGE', 'ADJUST'])
  })
})

// Issue 1350: the stock screen names the change on the button that makes it, so a wrong default
// can no longer write a delivery nobody meant.
describe('a movement is named before it is written', () => {
  test('a write-off, a delivery and an adjustment each say what they will do', () => {
    expect(saysMovementAction({ kind: 'WASTAGE', qty: 175, unit: 'ML', itemName: 'House red' })).toBe('Write off 175 ml of House red')
    expect(saysMovementAction({ kind: 'DELIVERY', qty: 24, unit: 'ITEM', itemName: 'Cider can' })).toBe('Record a delivery of 24 Cider can')
    expect(saysMovementAction({ kind: 'ADJUST', qty: 3, unit: 'ITEM', itemName: 'Crisps', adds: true })).toBe('Add 3 to Crisps')
    expect(saysMovementAction({ kind: 'ADJUST', qty: 3, unit: 'ITEM', itemName: 'Crisps', adds: false })).toBe('Take 3 off Crisps')
    // 0140: a delivery counted in whole containers says so.
    expect(saysMovementAction({ kind: 'DELIVERY', qty: 2100, unit: 'ML', itemName: 'Gin', containerMl: 700 })).toBe('Record a delivery of 3 × 700 ml of Gin')
    expect(saysMovementAction({ kind: 'DELIVERY', qty: 250, unit: 'ML', itemName: 'Gin', containerMl: 700 })).toBe('Record a delivery of 250 ml of Gin')
  })

  test('a write-off offers the amounts poured from the item, and the whole container once', () => {
    expect(writeOffSizes({ unit: 'ML', containerMl: 750, pourSizes: [175, 125] }))
      .toEqual([{ label: '125 ml', qty: 125 }, { label: '175 ml', qty: 175 }, { label: 'The whole container, 750 ml', qty: 750 }])
    expect(writeOffSizes({ unit: 'ML', containerMl: 750, pourSizes: [750] }))
      .toEqual([{ label: '750 ml', qty: 750 }])
    expect(writeOffSizes({ unit: 'ITEM', containerMl: null, pourSizes: [1] }))
      .toEqual([{ label: '1', qty: 1 }])
  })
})

describe('a movement is signed, explained and costed where it should be', () => {
  test('a movement of nothing is refused', () => {
    expect(aMovement({ qty: 0 }).success).toBe(false)
  })

  test('a quantity larger than the bar could hold is a typing mistake', () => {
    expect(aMovement({ qty: 9_999_999 }).success).toBe(false)
  })

  test('the sign is the caller\'s to state', () => {
    expect(aMovement({ kind: 'WASTAGE', qty: -750, reason: 'BREAKAGE' }).success).toBe(true)
    expect(aMovement({ qty: 750 }).success).toBe(true)
  })

  test('a reason comes from the vocabulary, never as free text', () => {
    expect(aMovement({ kind: 'WASTAGE', qty: -750, reason: 'Dropped by the cellar door' }).success).toBe(false)
    expect(aMovement({ kind: 'WASTAGE', qty: -750, reason: 'BREAKAGE' }).success).toBe(true)
  })

  // A wastage reason on a correction is a real vocabulary value, so it is the pairing that
  // refuses it, not the enum (F-204, stock review).
  test('a reason pairs with its kind: wastage reasons for wastage, correction reasons for a correction', () => {
    expect(aMovement({ kind: 'WASTAGE', qty: -750, reason: 'BREAKAGE' }).success).toBe(true)
    expect(aMovement({ kind: 'ADJUST', qty: -750, reason: 'COUNT_CORRECTION' }).success).toBe(true)
    expect(aMovement({ kind: 'ADJUST', qty: 750, reason: 'OPENING_BALANCE' }).success).toBe(true)

    const mismatched = aMovement({ kind: 'ADJUST', qty: -750, reason: 'OUT_OF_DATE' })
    expect(mismatched.success).toBe(false)
    expect(mismatched.success ? '' : mismatched.error.issues[0]?.message).toContain('Adjustment')

    expect(aMovement({ kind: 'WASTAGE', qty: -750, reason: 'COUNT_CORRECTION' }).success).toBe(false)
  })

  test('the kinds a person types in are the ones that have to be explained', () => {
    expect([...KINDS_NEEDING_A_REASON]).toEqual(['WASTAGE', 'ADJUST', 'REVERSAL'])
  })

  test('a cost is whole pence and never a fraction of one', () => {
    expect(aMovement({ costPence: 4.8 }).success).toBe(false)
    expect(aMovement({ costPence: 480 }).success).toBe(true)
  })

  // Decision 0100 (issue 1320): the screen sends one figure, what was paid, and the route decides
  // how it is kept, so no caller can send a price a millilitre any more.
  test('a delivery sends one cost, and a unit or a container cost of its own is refused', () => {
    expect(aMovement({ unitCostPence: 1 }).success).toBe(false)
    expect(aMovement({ containerCostPence: 650 }).success).toBe(false)
  })

  // A form validates its whole state, so a modal about one item cannot be held to the schema that
  // names one: it would refuse before the handler ran, with no field to show the message against.
  test('the stock screen validates the fields its modal actually holds', () => {
    const entry = (over: Record<string, unknown> = {}) =>
      movementEntryForm.safeParse({ kind: 'DELIVERY', qty: 750, ...over })

    expect(entry().success).toBe(true)
    expect(entry({ kind: 'WASTAGE', qty: -750 }).success).toBe(false)
    expect(entry({ kind: 'WASTAGE', qty: -750, reason: 'BREAKAGE' }).success).toBe(true)
    expect(movementForm.safeParse({ kind: 'DELIVERY', qty: 750 }).success).toBe(false)
  })
})

describe('a product says what it is and what it contains (F-111 criterion 1)', () => {
  test('a name is a label, so it holds no address', () => {
    expect(aProduct({ name: 'bar@newtheatre.org.uk' }).success).toBe(false)
  })

  // 0142: a recorded answer ticks what it contains; a note alone is text the till cannot check.
  test('recorded allergens are ticked, and a note alone does not record them', () => {
    expect(aProduct({ allergenState: 'RECORDED' }).success).toBe(false)
    expect(aProduct({ allergenState: 'RECORDED', allergenNote: 'Sulphites' }).success).toBe(false)
    expect(aProduct({ allergenState: 'RECORDED', addedAllergens: ['SULPHITES'] }).success).toBe(true)
  })

  test('a tick belongs to a recorded answer, and is kept in the list\'s own order', () => {
    expect(aProduct({ allergenState: 'NONE', addedAllergens: ['MILK'] }).success).toBe(false)
    expect(aProduct({ allergenState: 'RECORDED', addedAllergens: ['SHELLFISH'] }).success).toBe(false)
    const parsed = aProduct({ allergenState: 'RECORDED', addedAllergens: ['SULPHITES', 'MILK', 'MILK'] })
    expect(parsed.success && parsed.data.addedAllergens).toEqual(['MILK', 'SULPHITES'])
  })

  test('confirmed none is an answer, and unknown is the absence of one', () => {
    expect(aProduct({ allergenState: 'NONE' }).success).toBe(true)
    expect(aProduct({ allergenState: 'UNKNOWN', allergenNote: 'Sulphites' }).success).toBe(false)
  })

  test('a product with nothing said about it is unknown rather than clear', () => {
    const parsed = aProduct()
    expect(parsed.success && parsed.data.allergenState).toBe('UNKNOWN')
  })
})

describe('a category orders the till and a stocked item counts in its own unit', () => {
  test('a colour is a hex value or nothing', () => {
    expect(categoryForm.safeParse({ name: 'Wine', colour: 'burgundy' }).success).toBe(false)
    expect(categoryForm.safeParse({ name: 'Wine', colour: '#8b1e3f' }).success).toBe(true)
  })

  // A cleared field arrives as an empty string, and refusing it would leave a colour unremovable.
  test('a colour cleared out is no colour rather than a bad one', () => {
    const parsed = categoryForm.safeParse({ name: 'Wine', colour: '  ' })
    expect(parsed.success && parsed.data.colour).toBe(null)
  })

  test('a container size belongs to something measured', () => {
    expect(stockItemForm.safeParse({ name: 'Crisps', unit: 'ITEM', containerMl: 330 }).success).toBe(false)
    expect(stockItemForm.safeParse({ name: 'House red', unit: 'ML', containerMl: 750 }).success).toBe(true)
  })

  test('a quantity is whole units of the item\'s own unit', () => {
    expect(stockItemForm.safeParse({ name: 'House red', unit: 'ML', parQty: 12.5 }).success).toBe(false)
  })
})

describe('a serving size is a row, priced by a dated series (F-112, F-116)', () => {
  const aVariant = (over: Record<string, unknown> = {}) =>
    variantForm.safeParse({ productId: 'prod-1', servingKind: 'bottle', label: 'Bottle', ...over })

  test('a serving kind comes from the vocabulary a category default resolves on', () => {
    expect(aVariant({ servingKind: 'schooner' }).success).toBe(false)
    for (const kind of ['bottle', '125ml', '175ml', '250ml', 'single', 'double', 'pint', 'half', 'item']) {
      expect(`${kind}: ${aVariant({ servingKind: kind }).success}`).toBe(`${kind}: true`)
    }
  })

  // A price series and a sale both belong to the product a size was sold under.
  test('an edit does not move a size between products', () => {
    expect(Object.keys(variantEditForm.shape)).not.toContain('productId')
  })

  test('a depletion is positive and independent of price', () => {
    const set = (components: unknown[]) => componentsForm.safeParse({ components })
    expect(set([{ itemId: 'item-1', qty: 0 }]).success).toBe(false)
    expect(set([{ itemId: 'item-1', qty: -175 }]).success).toBe(false)
    expect(set([{ itemId: 'item-1', qty: 175 }]).success).toBe(true)
    // Twice the depletion at nothing like twice the price is exactly the point (0017).
    expect(set([{ itemId: 'item-1', qty: 50 }, { itemId: 'item-2', qty: 200 }]).success).toBe(true)
  })

  test('a stocked item appears once in a recipe', () => {
    expect(componentsForm.safeParse({
      components: [{ itemId: 'item-1', qty: 25 }, { itemId: 'item-1', qty: 50 }],
    }).success).toBe(false)
  })

  test('a price is whole pence on a civil date', () => {
    expect(priceForm.safeParse({ pricePence: 18.5, effectiveFrom: '2026-09-14' }).success).toBe(false)
    expect(priceForm.safeParse({ pricePence: -100, effectiveFrom: '2026-09-14' }).success).toBe(false)
    expect(priceForm.safeParse({ pricePence: 1800, effectiveFrom: '14/09/2026' }).success).toBe(false)
    expect(priceForm.safeParse({ pricePence: 1800, effectiveFrom: '2026-09-14' }).success).toBe(true)
  })

  // A £0.00 price went live with no comp asked for, and a field's unreadable text went in as no
  // price at all (0127). NaN is what PoundsField sends for text that is not a sum of money.
  test('a bar price is at least a penny, and unreadable text is refused in words', () => {
    const zero = priceForm.safeParse({ pricePence: 0, effectiveFrom: '2026-09-14' })
    expect(zero.success).toBe(false)
    expect(zero.error?.issues[0]?.message).toContain('a comp')
    expect(categoryPriceForm.safeParse({ servingKind: 'single', pricePence: 0, effectiveFrom: '2026-09-14' }).success).toBe(false)

    const unreadable = priceForm.safeParse({ pricePence: Number.NaN, effectiveFrom: '2026-09-14' })
    expect(unreadable.error?.issues[0]?.message).toBe('Type pounds and pence with a full stop, such as 2.50')
    expect(priceForm.safeParse({ pricePence: 1, effectiveFrom: '2026-09-14' }).success).toBe(true)
  })

  // The set-up page has no schema of its own; an opening of -5 became 1, a price of £2 none (0127).
  test('the set-up names the first price or quantity it cannot read, and passes the rest', () => {
    expect(firstUnreadable({ prices: [{ label: 'Single', pence: null }, { label: 'Double', pence: 450 }], quantities: [{ label: 'Opening', qty: 6 }] })).toBeNull()
    expect(firstUnreadable({ prices: [{ label: 'Single', pence: Number.NaN }] })).toBe('Single: Type pounds and pence with a full stop, such as 2.50.')
    expect(firstUnreadable({ prices: [{ label: 'Can', pence: 0 }] })).toContain('at least 1p')
    expect(firstUnreadable({ quantities: [{ label: 'How many', qty: Number.NaN }] })).toBe('How many: Type a whole number, such as 12.')
    expect(firstUnreadable({ quantities: [{ label: 'How many', qty: 0 }] })).toBe('How many: it has to be at least 1.')
    expect(firstUnreadable({ quantities: [{ label: 'How many', qty: null }] })).toBe('How many: Type a whole number, such as 12.')
  })

  // A crisp packet set up under Snacks came out age restricted and sold as a "Can" (F-111 c6).
  test('a new stocked item and its packaged kind start from what the category says it is', () => {
    expect(stockItemAgeRestrictedFor('Snacks')).toBe(false)
    expect(stockItemAgeRestrictedFor('Soft drinks')).toBe(false)
    expect(stockItemAgeRestrictedFor('Spirits')).toBe(true)
    expect(stockItemAgeRestrictedFor('Beer and cider')).toBe(true)
    expect(stockItemAgeRestrictedFor('Merchandise')).toBe(STOCK_ITEM_AGE_RESTRICTED_DEFAULT)

    expect(packagedKindFor('Snacks')).toBe('item')
    expect(packagedKindFor('Soft drinks')).toBe('can')
    expect(packagedKindFor('Bottled beer')).toBe('bottle')
    expect(packagedKindFor('Cans and bottles')).toBe('can')
    expect(packagedKindFor('Merchandise')).toBe('item')
  })

  test('a movement quantity that is not a whole number is refused in words', () => {
    const parsed = movementEntryForm.safeParse({ kind: 'ADJUST', qty: Number.NaN, reason: 'OTHER' })
    expect(parsed.error?.issues[0]?.message).toBe('Type a whole number, such as 12')
  })

  test('a date the calendar does not have is refused, not stored to sort first (0014)', () => {
    expect(priceForm.safeParse({ pricePence: 1800, effectiveFrom: '2026-13-45' }).success).toBe(false)
    expect(priceForm.safeParse({ pricePence: 1800, effectiveFrom: '2026-02-30' }).success).toBe(false)
    expect(categoryPriceForm.safeParse({ servingKind: 'single', pricePence: 250, effectiveFrom: '2026-13-45' }).success).toBe(false)
    expect(priceForm.safeParse({ pricePence: 1800, effectiveFrom: '2028-02-29' }).success).toBe(true)
  })

  test('a category default names the serving kind it prices (F-121 criterion 1)', () => {
    expect(categoryPriceForm.safeParse({ servingKind: 'single', pricePence: 250, effectiveFrom: '2026-09-14' }).success).toBe(true)
    expect(categoryPriceForm.safeParse({ servingKind: 'not-a-kind', pricePence: 250, effectiveFrom: '2026-09-14' }).success).toBe(false)
    expect(categoryPriceForm.safeParse({ servingKind: 'single', pricePence: -1, effectiveFrom: '2026-09-14' }).success).toBe(false)
  })
})

describe('the ledger reference a sale line snapshots (F-121 criterion 4)', () => {
  test('names the level and the row, so a later default change never restates a past sale', () => {
    expect(priceRef('variant', 'vp-1')).toBe('variant:vp-1')
    expect(priceRef('category', 'cp-1')).toBe('category:cp-1')
  })
})

describe('which dated row the till reads today (F-116 criteria 1, 3 and 5)', () => {
  // `seq` stands in for `rowid`: insertion order, independent of `id`, which is a random UUID
  // and no guide to which row came later (F-116, 0010).
  const row = (id: string, effectiveFrom: string, createdAt: number, seq: number) => ({ id, effectiveFrom, createdAt, seq })

  test('the latest row dated on or before the day wins', () => {
    const series = [row('a', '2026-09-01', 1000, 1), row('b', '2026-10-01', 2000, 2)]
    expect(effectivePriceRow(series, '2026-08-31')).toBeNull()
    expect(effectivePriceRow(series, '2026-09-30')?.id).toBe('a')
    expect(effectivePriceRow(series, '2026-10-01')?.id).toBe('b')
  })

  // The old estate held one row per day, which made a same-day mistake uncorrectable.
  test('two rows on one date resolve by which was written last', () => {
    const series = [row('a', '2026-09-01', 1000, 1), row('b', '2026-09-01', 2000, 2)]
    expect(effectivePriceRow(series, '2026-09-01')?.id).toBe('b')
  })

  // Two rows written in the same second still have to resolve to one, and to the same one twice.
  // `id` cannot be the tiebreak: two random UUIDs sort no more predictably than a coin toss.
  test('a tie in the same second still resolves, and resolves the same way every time', () => {
    const series = [row('z', '2026-09-01', 1000, 1), row('a', '2026-09-01', 1000, 2)]
    expect(effectivePriceRow(series, '2026-09-01')?.id).toBe('a')
    expect(effectivePriceRow([...series].reverse(), '2026-09-01')?.id).toBe('a')
  })

  test('a future row waits for its date', () => {
    const series = [row('a', '2026-09-01', 1000, 1), row('b', '2027-01-01', 2000, 2)]
    expect(effectivePriceRow(series, '2026-12-31')?.id).toBe('a')
    expect(effectivePriceRow(series, '2027-01-01')?.id).toBe('b')
  })

  test('a size nothing has priced resolves to nothing rather than to nought', () => {
    expect(effectivePriceRow([], '2026-09-01')).toBeNull()
  })
})

describe('what a screen shows', () => {
  test('a quantity reads in the unit it is counted in', () => {
    expect(saysQuantity(5075, 'ML')).toBe('5075 ml')
    expect(saysQuantity(12, 'ITEM')).toBe('12')
    expect(saysQuantity(-750, 'ML')).toBe('-750 ml')
  })

  test('money reads in pounds and is held in pence', () => {
    expect(saysMoney(480)).toBe('£4.80')
    expect(saysMoney(0)).toBe('£0.00')
  })

  // The review of 13 October 2026: imported history read "£1284.00".
  test('money over a thousand pounds groups its thousands, either side of zero', () => {
    expect(saysMoney(128_400)).toBe('£1,284.00')
    expect(saysMoney(123_456_789)).toBe('£1,234,567.89')
    expect(saysMoney(-100_005)).toBe('−£1,000.05')
    expect(saysMoney(-5)).toBe('−£0.05')
  })

  // The par-level status a manager scans the stocked items list for (#907).
  test('stock status compares on-hand to par, matching the order list\'s own shortfall rule', () => {
    expect(stockStatus(0, 48)).toBe('OUT')
    expect(stockStatus(-3, 48)).toBe('OUT')
    expect(stockStatus(18, 48)).toBe('BELOW_PAR')
    expect(stockStatus(48, 48)).toBe('OK')
    expect(stockStatus(60, 48)).toBe('OK')
  })

  test('an item with no par level carries no status, matching the order list\'s unconfigured row', () => {
    expect(stockStatus(18, null)).toBeNull()
    expect(stockStatus(0, null)).toBe('OUT')
  })

  test('the status has words for the badge', () => {
    expect(saysStockStatus('OUT')).toBe('Out')
    expect(saysStockStatus('BELOW_PAR')).toBe('Below par')
    expect(saysStockStatus('OK')).toBe('OK')
  })

  // #908 item 3: a bare hyphen glued to the pound sign read as "£-56.00" on a stocktake's at-cost column.
  test('negative money reads as a minus sign before the currency, not £-56.00', () => {
    expect(saysMoney(-5600)).toBe('−£56.00')
  })

  test('every value in the vocabularies has words for it', () => {
    expect(says('OUT_OF_DATE')).toBe('Out of date')
    expect(says('NONE')).toBe('Confirmed no allergens')
    // A value nothing has words for reads as itself rather than as a blank.
    expect(says('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })
})

// F-111 criterion 6, issue 1151 item 10: three screens each spelled their own starting value for
// the same switch. Issue 1299: a product's Check ID now follows what it pours, so it has no default.
describe('one stated default for a new stocked item, and none for a product', () => {
  const ITEM_CREATORS = ['app/pages/bar/products/new.vue', 'app/pages/bar/stock/index.vue']

  test('a new stocked item is restricted, since the shelf it comes off mostly is', () => {
    expect(STOCK_ITEM_AGE_RESTRICTED_DEFAULT).toBe(true)
  })

  test('a product has no restriction default: Check ID follows what it pours (issue 1299)', async () => {
    const bar = await import('#shared/utils/bar')
    expect('PRODUCT_AGE_RESTRICTED_DEFAULT' in bar).toBe(false)
    // Its own switch is "restricted anyway", and a new product starts without it.
    expect(productForm.parse({ name: 'Pint of bitter', categoryId: 'cat-1' }).ageRestricted).toBe(false)
  })

  test('a stocked item falls back to its own default rather than to a value typed into the schema', () => {
    const item = stockItemForm.parse({ name: 'Bitter cask', unit: 'ML' })
    expect(item.ageRestricted).toBe(STOCK_ITEM_AGE_RESTRICTED_DEFAULT)
  })

  test('no screen that creates a stocked item spells a starting value of its own', async () => {
    const offenders: string[] = []
    for (const file of ITEM_CREATORS) {
      const source = await Bun.file(file).text()
      if (!source.includes('STOCK_ITEM_AGE_RESTRICTED_DEFAULT')) offenders.push(`${file} (reads no shared default)`)
    }
    expect(offenders).toEqual([])
  })
})

// F-111 criterion 6: the picker listed the first page of the register and pointed at another
// screen for the rest, which is not a way to reach the rest from here (K-123).
describe('the stocked-item picker reaches the whole register', () => {
  const SCREEN = 'app/pages/bar/products/new.vue'

  test('it searches the register rather than naming what it left out', async () => {
    const source = await Bun.file(SCREEN).text()
    expect(source).toContain('update:search-term')
    expect(source).not.toContain('reached from the stock screen')
  })

  test('the search goes to the register\'s own route, so the match is made in SQL', async () => {
    expect(await Bun.file(SCREEN).text()).toContain('/api/admin/bar/items')
  })
})

// F-111 criterion 6: two buttons side by side both created a product, one of them leaving it
// without the stocked item and sizes the other sets up.
describe('there is one way to create a product', () => {
  test('the products screen offers the set-up flow and no second creator beside it', async () => {
    const source = await Bun.file('app/pages/bar/products/index.vue').text()
    expect(source).toContain('data-test="set-up-product"')
    expect(source).not.toContain('data-test="add-product"')
  })
})

// Decision 0100 (issue 1320): what a screen records a delivery's cost as, and how the history
// reads it back, in the terms the stock was bought in.
describe('a delivery is costed by the container it came in (0100)', () => {
  test('each item is asked for its cost the way it is bought', () => {
    expect(deliveryCostBasis({ unit: 'ML', containerMl: 750 })).toBe('CONTAINER')
    expect(deliveryCostBasis({ unit: 'ML', containerMl: null })).toBe('DELIVERY')
    expect(deliveryCostBasis({ unit: 'ITEM', containerMl: null })).toBe('UNIT')
    expect(DELIVERY_COST_QUESTION.CONTAINER.label).toBe('Cost of one container')
  })

  test('a measured item with a container size is costed by that container', () => {
    expect(deliveryCost({ unit: 'ML', containerMl: 750 }, 4500, 650))
      .toEqual({ unitCostPence: null, containerCostPence: 650, containerQty: 750 })
  })

  test('a measured item with no one container size is costed by the whole delivery', () => {
    expect(deliveryCost({ unit: 'ML', containerMl: null }, 50_000, 12_000))
      .toEqual({ unitCostPence: null, containerCostPence: 12_000, containerQty: 50_000 })
  })

  test('a whole item is costed by the unit, which is exact already', () => {
    expect(deliveryCost({ unit: 'ITEM', containerMl: null }, 24, 95))
      .toEqual({ unitCostPence: 95, containerCostPence: null, containerQty: null })
  })

  test('no cost entered records none rather than nought', () => {
    expect(deliveryCost({ unit: 'ML', containerMl: 750 }, 750, null))
      .toEqual({ unitCostPence: null, containerCostPence: null, containerQty: null })
  })

  test('the history says what a delivery cost in the terms it was bought in', () => {
    expect(saysDeliveryCost({ unit: 'ML', unitCostPence: null, containerCostPence: 650, containerQty: 750 })).toBe('£6.50 for 750 ml')
    expect(saysDeliveryCost({ unit: 'ITEM', unitCostPence: null, containerCostPence: 2150, containerQty: 24 })).toBe('£21.50 for 24')
    expect(saysDeliveryCost({ unit: 'ITEM', unitCostPence: 95, containerCostPence: null, containerQty: null })).toBe('£0.95 each')
    expect(saysDeliveryCost({ unit: 'ML', unitCostPence: 1, containerCostPence: null, containerQty: null })).toBe('£0.01 a ml')
    expect(saysDeliveryCost({ unit: 'ML', unitCostPence: null, containerCostPence: null, containerQty: null })).toBe('')
  })
})

// Issue 1348 (F-107 criteria 1, 3 and 4): the answer is given once, on the stocked item, and a
// product reads its own from everything it pours, choices included, plus what the bar adds.
describe('a product takes its allergen answer from what it pours', () => {
  const noAddition = { state: 'UNKNOWN', note: null } as const

  test('everything poured confirmed clear, and nothing added, is confirmed none', () => {
    expect(deriveAllergens([
      { itemName: 'Gin', state: 'NONE', note: null },
      { itemName: 'Tonic water', state: 'NONE', note: null },
    ], noAddition)).toEqual({ state: 'NONE', note: null, allergens: [] })
  })

  test('a recorded item is named with its note, and what the bar adds follows', () => {
    expect(deriveAllergens([
      { itemName: 'House red', state: 'RECORDED', note: 'Contains sulphites.' },
      { itemName: 'Lemonade', state: 'NONE', note: null },
    ], { state: 'RECORDED', note: 'Orange slice' })).toEqual({
      state: 'RECORDED',
      note: 'House red: Contains sulphites. Added at the bar: Orange slice.',
      allergens: [],
    })
  })

  test('one item nobody has answered for leaves the product unanswered, and says which', () => {
    expect(deriveAllergens([
      { itemName: 'House red', state: 'RECORDED', note: 'Contains sulphites' },
      { itemName: 'Tonic water', state: 'UNKNOWN', note: null },
    ], { state: 'NONE', note: null })).toEqual({
      state: 'UNKNOWN',
      note: 'No information recorded for Tonic water. House red: Contains sulphites.',
      allergens: [],
    })
  })

  test('a product that pours nothing keeps the answer it was given', () => {
    expect(deriveAllergens([], { state: 'RECORDED', note: 'Contains nuts' })).toEqual({ state: 'RECORDED', note: 'Contains nuts', allergens: [] })
    expect(deriveAllergens([], noAddition)).toEqual({ state: 'UNKNOWN', note: null, allergens: [] })
  })

  // A food-safety answer fails closed: a recorded answer with nothing written, or a state no form
  // writes, is no answer at all, never a clean one (a direct load can write either).
  test('a recorded item with no note, or a state outside the three, is unanswered', () => {
    expect(deriveAllergens([
      { itemName: 'Guest ale', state: 'RECORDED', note: null },
      { itemName: 'Cider', state: 'RECORDED', note: '  ' },
      { itemName: 'Perry', state: 'bogus' as AllergenState, note: null },
      { itemName: 'Lemonade', state: 'NONE', note: null },
    ], noAddition)).toEqual({ state: 'UNKNOWN', note: 'No information recorded for Guest ale, Cider, Perry.', allergens: [] })
  })

  // The bar's addition fails closed too; its own "No information recorded" still means nothing added.
  test('an addition recorded with nothing written is unanswered, poured or not', () => {
    expect(deriveAllergens([{ itemName: 'Gin', state: 'NONE', note: null }], { state: 'RECORDED', note: ' ' }))
      .toEqual({ state: 'UNKNOWN', note: 'No information recorded for what the bar adds.', allergens: [] })
    expect(deriveAllergens([], { state: 'RECORDED', note: '' })).toEqual({ state: 'UNKNOWN', note: null, allergens: [] })
  })

  // A note is never hidden: a caution written on an item answered clear reaches the till with it.
  test('a note on an item or an addition answered clear is read out, and leaves it clear', () => {
    expect(deriveAllergens([
      { itemName: 'Gin', state: 'NONE', note: 'May contain traces of milk' },
      { itemName: 'Tonic water', state: 'NONE', note: null },
    ], { state: 'NONE', note: 'Served with a lime wedge' })).toEqual({
      state: 'NONE',
      note: 'Gin: May contain traces of milk. Added at the bar: Served with a lime wedge.',
      allergens: [],
    })
  })

  // 0142: what is ticked anywhere in the glass is ticked on the product, once, in the list's order.
  test('the ticks of everything poured and added are gathered once, in order', () => {
    expect(deriveAllergens([
      { itemName: 'House red', state: 'RECORDED', note: null, allergens: ['SULPHITES'] },
      { itemName: 'Lager', state: 'RECORDED', note: 'Barley', allergens: ['GLUTEN', 'SULPHITES'] },
    ], { state: 'RECORDED', note: null, allergens: ['MILK'] })).toEqual({
      state: 'RECORDED',
      note: 'Lager: Barley.',
      allergens: ['GLUTEN', 'MILK', 'SULPHITES'],
    })
  })

  test('a tick left on an answer set to none, or on an unanswered part, says nothing', () => {
    expect(deriveAllergens([
      { itemName: 'Gin', state: 'NONE', note: null, allergens: ['MILK'] },
      { itemName: 'Cider', state: 'UNKNOWN', note: null, allergens: ['SULPHITES'] },
    ], noAddition)).toEqual({ state: 'UNKNOWN', note: 'No information recorded for Cider.', allergens: [] })
  })

  // A free-text answer from before ticks existed is still read out until somebody ticks it.
  test('a recorded answer in words only is still an answer, with nothing ticked', () => {
    expect(deriveAllergens([
      { itemName: 'Crisps', state: 'RECORDED', note: 'May contain milk', allergens: [] },
    ], noAddition)).toEqual({ state: 'RECORDED', note: 'Crisps: May contain milk.', allergens: [] })
  })
})

describe('what the product editor says the till will say', () => {
  test('the answer ends its sentence, and a note follows as one of its own', () => {
    expect(saysAtTheTill({ state: 'NONE', note: null, allergens: [] })).toBe('Confirmed no allergens.')
    expect(saysAtTheTill({ state: 'RECORDED', note: 'Contains nuts', allergens: [] })).toBe('Allergens recorded. Contains nuts.')
    expect(saysAtTheTill({ state: 'RECORDED', note: 'Gin: Contains sulphites.', allergens: [] })).toBe('Allergens recorded. Gin: Contains sulphites.')
  })

  test('what is ticked is said before the note, in plain words', () => {
    expect(saysAtTheTill({ state: 'RECORDED', note: 'Chocolate bar: May contain nuts.', allergens: ['MILK', 'SOYA'] }))
      .toBe('Allergens recorded. Contains milk and soya. Chocolate bar: May contain nuts.')
    expect(saysAllergens(['GLUTEN', 'EGGS', 'SULPHITES'])).toBe('Cereals containing gluten, eggs and sulphur dioxide and sulphites')
  })
})

describe('a stocked item carries the allergen answer (issue 1348)', () => {
  test('a tick with no state stated is a recorded answer; nothing at all is no answer', () => {
    expect(stockItemForm.parse({ name: 'House red', unit: 'ML', allergens: ['SULPHITES'] }).allergenState).toBe('RECORDED')
    expect(stockItemForm.parse({ name: 'Gin', unit: 'ML' }).allergenState).toBe('UNKNOWN')
    expect(stockItemForm.parse({ name: 'Gin', unit: 'ML', allergenState: 'NONE' }).allergenState).toBe('NONE')
  })

  test('recorded needs a tick, and a note is not filed as unknown', () => {
    expect(stockItemForm.safeParse({ name: 'House red', unit: 'ML', allergenState: 'RECORDED' }).success).toBe(false)
    expect(stockItemForm.safeParse({ name: 'House red', unit: 'ML', allergenNotes: 'Sulphites' }).success).toBe(false)
    expect(stockItemForm.safeParse({ name: 'House red', unit: 'ML', allergenState: 'RECORDED', allergenNotes: 'Sulphites' }).success).toBe(false)
    expect(stockItemForm.safeParse({ name: 'Gin', unit: 'ML', allergenState: 'NONE', allergens: ['GLUTEN'] }).success).toBe(false)
    expect(stockItemForm.safeParse({ name: 'House red', unit: 'ML', allergenState: 'UNKNOWN', allergenNotes: 'Sulphites' }).success).toBe(false)
  })
})

// 0140: the order list asks for what a supplier sells, whole items or whole containers.
describe('what the order list asks a supplier for', () => {
  test('whole items as they are, a measured shortfall in containers rounded up', () => {
    expect(toOrder({ unit: 'ITEM', containerMl: null, shortfall: 31 })).toBe(31)
    expect(toOrder({ unit: 'ML', containerMl: 750, shortfall: 1275 })).toBe(2)
    expect(toOrder({ unit: 'ML', containerMl: 700, shortfall: 1400 })).toBe(2)
    expect(saysToOrder({ unit: 'ML', containerMl: 750, shortfall: 1275 })).toBe('2 × 750 ml')
  })

  test('a measured item with no container size is left in millilitres', () => {
    expect(toOrder({ unit: 'ML', containerMl: null, shortfall: 500 })).toBeNull()
    expect(saysToOrder({ unit: 'ML', containerMl: null, shortfall: 500 })).toBe('500 ml')
  })
})

// A void's stock return is stored as a count correction, but reads as the void it was.
describe('a movement says why it happened', () => {
  test('a reversal of a sale is a tab charge voided, not a count correction', () => {
    expect(saysMovementReason({ kind: 'REVERSAL', reason: 'COUNT_CORRECTION', reversesKind: 'SALE' })).toBe('Tab charge voided')
    expect(saysMovementReason({ kind: 'REVERSAL', reason: 'COUNT_CORRECTION', reversesKind: 'DELIVERY' })).toBe('Count correction')
    expect(saysMovementReason({ kind: 'DELIVERY', reason: null, reversesKind: null })).toBeNull()
  })
})
