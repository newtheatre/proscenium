import { describe, expect, test } from 'bun:test'
import { MAX_BASKET_LINES, MAX_BASKET_LINE_QTY, basketForm, basketLineForm, saleForm } from '#shared/utils/sale'

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

describe('a sale may name a tab holder to charge instead of the reader (F-108)', () => {
  test('no tab holder named is the default, and the sale is on the reader', () => {
    const parsed = saleForm.safeParse({ lines: [{ variantId: 'var-1', qty: 1 }], expectedTotalPence: 250 })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.tabHolderId).toBeNull()
  })

  test('a tab holder id is carried through', () => {
    const parsed = saleForm.safeParse({ lines: [{ variantId: 'var-1', qty: 1 }], expectedTotalPence: 250, tabHolderId: 'user-1' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.tabHolderId).toBe('user-1')
  })
})
