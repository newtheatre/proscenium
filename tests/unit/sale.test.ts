import { describe, expect, test } from 'bun:test'
import { MAX_BASKET_LINES, MAX_BASKET_LINE_QTY, basketForm, basketLineForm, saleForm } from '#shared/utils/sale'

const aLine = { variantId: 'var-1', qty: 1 }

// F-103's write-path rules: a basket line is a size at a quantity, and a basket is a bounded list
// of them, so nothing here can grow the bound parameters a price check binds without limit.

describe('a basket line is a size at a quantity (F-103 criteria 2, 4)', () => {
  test('a bare variant and quantity is valid, with no choice', () => {
    expect(basketLineForm.safeParse({ variantId: 'var-1', qty: 1 }).success).toBe(true)
  })

  test('a choice is carried alongside the variant it belongs to', () => {
    expect(basketLineForm.safeParse({ variantId: 'var-1', qty: 1, choiceItemId: 'item-1' }).success).toBe(true)
  })

  test('a quantity of nothing, or too much, is refused', () => {
    expect(basketLineForm.safeParse({ variantId: 'var-1', qty: 0 }).success).toBe(false)
    expect(basketLineForm.safeParse({ variantId: 'var-1', qty: -1 }).success).toBe(false)
    expect(basketLineForm.safeParse({ variantId: 'var-1', qty: MAX_BASKET_LINE_QTY + 1 }).success).toBe(false)
    expect(basketLineForm.safeParse({ variantId: 'var-1', qty: MAX_BASKET_LINE_QTY }).success).toBe(true)
  })
})

describe('a basket is bounded, so a price check never binds a growing parameter list (0003)', () => {
  test('an empty basket cannot be submitted', () => {
    expect(basketForm.safeParse({ lines: [] }).success).toBe(false)
  })

  test('a basket over the line cap is refused', () => {
    const lines = Array.from({ length: MAX_BASKET_LINES + 1 }, () => ({ variantId: 'var-1', qty: 1 }))
    expect(basketForm.safeParse({ lines }).success).toBe(false)
  })

  test('a basket at the cap is accepted', () => {
    const lines = Array.from({ length: MAX_BASKET_LINES }, () => ({ variantId: 'var-1', qty: 1 }))
    expect(basketForm.safeParse({ lines }).success).toBe(true)
  })
})

describe('a sale submission carries what the screen believes the total is (F-104 criterion 1)', () => {
  test('a basket with an expected total is valid', () => {
    expect(saleForm.safeParse({ lines: [{ variantId: 'var-1', qty: 1 }], expectedTotalPence: 250 }).success).toBe(true)
  })

  test('an expected total is required, whole, and never negative', () => {
    expect(saleForm.safeParse({ lines: [{ variantId: 'var-1', qty: 1 }] }).success).toBe(false)
    expect(saleForm.safeParse({ lines: [{ variantId: 'var-1', qty: 1 }], expectedTotalPence: 2.5 }).success).toBe(false)
    expect(saleForm.safeParse({ lines: [{ variantId: 'var-1', qty: 1 }], expectedTotalPence: -1 }).success).toBe(false)
    expect(saleForm.safeParse({ lines: [{ variantId: 'var-1', qty: 1 }], expectedTotalPence: 0 }).success).toBe(true)
  })
})

describe('an age-restricted line may carry a Challenge 25 outcome (F-106 criterion 1)', () => {
  test('a submission with no restricted line needs no outcome', () => {
    const parsed = saleForm.safeParse({ lines: [aLine], expectedTotalPence: 250 })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.ageCheck).toBeNull()
  })

  test('a valid outcome rides alongside the basket', () => {
    const parsed = saleForm.safeParse({
      lines: [aLine],
      expectedTotalPence: 250,
      ageCheck: { outcome: 'ACCEPTED', idType: 'PASSPORT', description: 'Tall man, grey coat' },
    })
    expect(parsed.success).toBe(true)
  })

  test('an outcome with no ID type on an accepted check is refused, the same as standalone', () => {
    const parsed = saleForm.safeParse({
      lines: [aLine],
      expectedTotalPence: 250,
      ageCheck: { outcome: 'ACCEPTED', description: 'Tall man, grey coat' },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('a basket may name a discount to apply (F-117 criterion 4)', () => {
  test('no discount named is the default', () => {
    const parsed = basketForm.safeParse({ lines: [aLine] })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.discountId).toBeNull()
  })

  test('a discount id is carried through', () => {
    const parsed = basketForm.safeParse({ lines: [aLine], discountId: 'disc-1' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.discountId).toBe('disc-1')
  })
})
