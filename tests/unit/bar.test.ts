import { describe, expect, test } from 'bun:test'
import {
  HAND_ENTERED_KINDS,
  KINDS_NEEDING_A_REASON,
  MOVEMENT_WRITERS,
  STOCK_MOVEMENT_KINDS,
  categoryForm,
  movementForm,
  productForm,
  says,
  saysMoney,
  saysQuantity,
  stockItemForm,
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

  test('a container size belongs to something measured', () => {
    expect(stockItemForm.safeParse({ name: 'Crisps', unit: 'ITEM', containerMl: 330 }).success).toBe(false)
    expect(stockItemForm.safeParse({ name: 'House red', unit: 'ML', containerMl: 750 }).success).toBe(true)
  })

  test('a quantity is whole units of the item\'s own unit', () => {
    expect(stockItemForm.safeParse({ name: 'House red', unit: 'ML', parQty: 12.5 }).success).toBe(false)
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
