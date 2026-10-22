import { describe, expect, test } from 'bun:test'
import { selfServeCatalogue, selfTabForm, selfTabTotal } from '#shared/utils/self-tab'
import type { SaleCatalogue, SaleProduct, SaleVariant } from '#shared/utils/sale'

// F-108 criterion 7, 0165: what a holder may add to their own tab, and the total the screen sends.

const variant = (id: string, pricePence: number, extra: Partial<SaleVariant> = {}): SaleVariant =>
  ({ id, servingKind: 'single', label: 'Single', pricePence, priceSource: 'OWN', choice: null, stock: null, ...extra }) as SaleVariant

const product = (id: string, categoryId: string, variants: SaleVariant[], ageRestricted = false): SaleProduct =>
  ({ id, name: id, categoryId, ageRestricted, allergenState: 'NONE', allergenNote: null, allergens: [], variants }) as SaleProduct

const catalogue: SaleCatalogue = {
  on: '2026-10-22',
  categories: [{ id: 'soft', name: 'Soft', sort: 0, colour: null }, { id: 'wine', name: 'Wine', sort: 1, colour: null }],
  products: [
    product('cola', 'soft', [
      variant('cola-can', 150),
      variant('cola-mixer', 200, { choice: { id: 'c', name: 'Mixer', options: [], optional: false } }),
      variant('cola-ice', 180, { choice: { id: 'i', name: 'Ice', options: [], optional: true } }),
    ]),
    product('lemonade', 'soft', [variant('lemonade-shot', 300, { ageRestricted: true })]),
    product('merlot', 'wine', [variant('merlot-glass', 500)], true),
  ],
}

describe('selfServeCatalogue', () => {
  test('leaves out anything restricted, and any size with a choice that must be answered', () => {
    const offered = selfServeCatalogue(catalogue)
    expect(offered.products.map(one => one.id)).toEqual(['cola'])
    expect(offered.products[0]!.variants.map(one => one.id)).toEqual(['cola-can', 'cola-ice'])
  })

  test('drops a category left with nothing in it', () => {
    expect(selfServeCatalogue(catalogue).categories.map(one => one.id)).toEqual(['soft'])
  })
})

describe('selfTabTotal', () => {
  test('sums the offered prices', () => {
    expect(selfTabTotal([{ variantId: 'cola-can', qty: 2 }, { variantId: 'cola-ice', qty: 1 }], catalogue)).toBe(480)
  })

  test('a size the catalogue does not have has no total', () => {
    expect(selfTabTotal([{ variantId: 'gone', qty: 1 }], catalogue)).toBeNull()
  })
})

describe('selfTabForm', () => {
  test('needs a bar and at least one line', () => {
    expect(selfTabForm.safeParse({ venueId: 'v', lines: [], expectedTotalPence: 0 }).success).toBe(false)
    expect(selfTabForm.safeParse({ lines: [{ variantId: 'a', qty: 1 }], expectedTotalPence: 150 }).success).toBe(false)
    expect(selfTabForm.safeParse({ venueId: 'v', lines: [{ variantId: 'a', qty: 1 }], expectedTotalPence: 150 }).success).toBe(true)
  })
})
