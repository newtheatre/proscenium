import { describe, expect, test } from 'bun:test'
import {
  HAND_ENTERED_KINDS,
  KINDS_NEEDING_A_REASON,
  MOVEMENT_WRITERS,
  STOCK_MOVEMENT_KINDS,
  categoryForm,
  categoryPriceForm,
  componentsForm,
  effectivePriceRow,
  movementEntryForm,
  movementForm,
  priceRef,
  productForm,
  says,
  saysMoney,
  saysQuantity,
  priceForm,
  stockItemForm,
  variantEditForm,
  variantForm,
} from '#shared/utils/bar'

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

  test('the kinds a person types in are the ones that have to be explained', () => {
    expect([...KINDS_NEEDING_A_REASON]).toEqual(['WASTAGE', 'ADJUST', 'REVERSAL'])
  })

  test('a cost is whole pence and never a fraction of one', () => {
    expect(aMovement({ unitCostPence: 4.8 }).success).toBe(false)
    expect(aMovement({ unitCostPence: 480 }).success).toBe(true)
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

  test('recorded allergens need the note that records them', () => {
    expect(aProduct({ allergenState: 'RECORDED' }).success).toBe(false)
    expect(aProduct({ allergenState: 'RECORDED', allergenNote: 'Sulphites' }).success).toBe(true)
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

  test('every value in the vocabularies has words for it', () => {
    expect(says('OUT_OF_DATE')).toBe('Out of date')
    expect(says('NONE')).toBe('Confirmed no allergens')
    // A value nothing has words for reads as itself rather than as a blank.
    expect(says('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })
})
