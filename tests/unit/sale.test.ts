import { describe, expect, test } from 'bun:test'
import { MAX_BASKET_LINES, MAX_BASKET_LINE_QTY, basketForm, basketLineForm, checkIdFor, lineNeedsCheckId, needsTheReader, saleForm } from '#shared/utils/sale'
import type { SaleProduct } from '#shared/utils/sale'

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

// Decision 0096: the reader answers before anything is written, so only what involves no reader
// may still be written in one step.
describe('what waits for the reader and what does not (0096)', () => {
  test('a card basket with money in it waits for the reader', () => {
    expect(needsTheReader({ tabHolderId: null, expectedTotalPence: 250 })).toBe(true)
  })

  test('a tab charge and a basket with nothing to take are written at once', () => {
    expect(needsTheReader({ tabHolderId: 'user-1', expectedTotalPence: 250 })).toBe(false)
    expect(needsTheReader({ tabHolderId: null, expectedTotalPence: 0 })).toBe(false)
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

// F-122 and F-123: a booking's ticket money and a walk-up join the same basket, and credit never
// carries either (criterion 5), so the form refuses that shape before any route sees it.
describe('tickets and walk-ups in the basket (F-122, F-123)', () => {
  const ticket = { reservationId: 'res-1' }
  const walkUp = { performanceId: 'perf-1', ticketTypeId: 'tt-1', quantity: 2 }

  test('a basket of bookings alone, with no bar line, is a sale', () => {
    expect(saleForm.safeParse({ lines: [], tickets: [ticket], expectedTotalPence: 900 }).success).toBe(true)
    expect(saleForm.safeParse({ lines: [], walkUps: [walkUp], expectedTotalPence: 1800 }).success).toBe(true)
  })

  test('an empty basket is still refused', () => {
    expect(saleForm.safeParse({ lines: [], tickets: [], walkUps: [], expectedTotalPence: 0 }).success).toBe(false)
  })

  test('a booking appears once, and a walk-up type once per performance', () => {
    expect(saleForm.safeParse({ lines: [], tickets: [ticket, ticket], expectedTotalPence: 1800 }).success).toBe(false)
    expect(saleForm.safeParse({ lines: [], walkUps: [walkUp, walkUp], expectedTotalPence: 3600 }).success).toBe(false)
  })

  test('a tab refuses a basket holding a ticket line (criterion 5)', () => {
    expect(saleForm.safeParse({ lines: [aLine], tickets: [ticket], expectedTotalPence: 1150, tabHolderId: 'user-1' }).success).toBe(false)
    expect(saleForm.safeParse({ lines: [aLine], walkUps: [walkUp], expectedTotalPence: 2050, tabHolderId: 'user-1' }).success).toBe(false)
    expect(saleForm.safeParse({ lines: [aLine], expectedTotalPence: 250, tabHolderId: 'user-1' }).success).toBe(true)
  })

  test('a walk-up guest is optional, and a partial one is refused (D-115 criterion 6)', () => {
    const parsed = saleForm.parse({ lines: [], walkUps: [walkUp], expectedTotalPence: 1800 })
    expect(parsed.walkUpGuest).toBeNull()
    expect(saleForm.safeParse({ lines: [], walkUps: [walkUp], expectedTotalPence: 1800, walkUpGuest: { name: 'Sam', email: 'sam@example.invalid' } }).success).toBe(true)
    expect(saleForm.safeParse({ lines: [], walkUps: [walkUp], expectedTotalPence: 1800, walkUpGuest: { name: 'Sam', email: 'not an address' } }).success).toBe(false)
  })
})

// Issue 1299, F-106 criterion 1, F-111 criterion 6: Check ID follows what a line pours, and the
// product's own switch only adds it to one that pours nothing restricted ("restricted anyway").
describe('Check ID follows what a line pours (issue 1299)', () => {
  const restrictedItems = new Set(['item-gin', 'item-rum'])

  test('a size pouring a restricted item asks, whatever its product is switched to', () => {
    expect(checkIdFor(false, ['item-gin', 'item-tonic'], restrictedItems)).toBe(true)
  })

  test('a size pouring nothing restricted asks only when its product is restricted anyway', () => {
    expect(checkIdFor(false, ['item-tonic'], restrictedItems)).toBe(false)
    expect(checkIdFor(true, ['item-tonic'], restrictedItems)).toBe(true)
    expect(checkIdFor(true, [], restrictedItems)).toBe(true)
    expect(checkIdFor(false, [], restrictedItems)).toBe(false)
  })

  const cola: SaleProduct = {
    id: 'p-cola',
    name: 'Cola',
    categoryId: 'cat-1',
    ageRestricted: true,
    allergenState: 'NONE',
    allergenNote: null,
    variants: [
      { id: 'v-gin', servingKind: 'single', label: 'With gin', pricePence: 450, priceSource: 'variant', choice: null, stock: null, ageRestricted: true },
      {
        id: 'v-mixed', servingKind: 'single', label: 'Glass', pricePence: 250, priceSource: 'variant', stock: null, ageRestricted: false,
        choice: { id: 'g-1', name: 'Mixer', options: [{ id: 'o-rum', itemName: 'Rum', ageRestricted: true }, { id: 'o-ice', itemName: 'Ice', ageRestricted: false }] },
      },
    ],
  }

  test('a line asks when its size or the option chosen pours restricted stock, and not otherwise', () => {
    expect(lineNeedsCheckId([cola], { variantId: 'v-gin', choiceItemId: null })).toBe(true)
    expect(lineNeedsCheckId([cola], { variantId: 'v-mixed', choiceItemId: 'o-rum' })).toBe(true)
    expect(lineNeedsCheckId([cola], { variantId: 'v-mixed', choiceItemId: 'o-ice' })).toBe(false)
  })

  test('the tile\'s own mark is not the line\'s answer: a product marked for one size leaves the others alone', () => {
    expect(cola.ageRestricted).toBe(true)
    expect(lineNeedsCheckId([cola], { variantId: 'v-mixed', choiceItemId: 'o-ice' })).toBe(false)
  })

  test('a size the catalogue does not hold asks nothing, and the server decides', () => {
    expect(lineNeedsCheckId([cola], { variantId: 'v-gone', choiceItemId: null })).toBe(false)
  })
})
