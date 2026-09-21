import { describe, expect, test } from 'bun:test'
import { computed, effectScope, ref } from 'vue'
import { useTillBasket } from '#composables/useTillBasket'
import type { TillBasketDeps } from '#composables/useTillBasket'
import type { InlineAgeCheckInput } from '#shared/utils/age-checks'
import type { PricedBasket, SaleProduct, SaleVariant, TillBooking } from '#shared/utils/sale'

// F-103, F-104, F-106: what a tap puts in the basket, what a charge submits, and what an
// age-check refusal takes back out.

function aVariant(over: Partial<SaleVariant> = {}): SaleVariant {
  return {
    id: 'variant-1',
    servingKind: 'pint',
    label: 'Pint',
    pricePence: 500,
    priceSource: 'variant',
    choice: null,
    ...over,
  }
}

function aProduct(over: Partial<SaleProduct> = {}): SaleProduct {
  return {
    id: 'product-1',
    name: 'Lager',
    categoryId: 'cat-1',
    ageRestricted: false,
    allergenState: 'NONE',
    allergenNote: null,
    variants: [aVariant()],
    ...over,
  }
}

function aPriced(over: Partial<PricedBasket> = {}): PricedBasket {
  return {
    lines: [],
    totalPence: 0,
    discount: null,
    ...over,
  }
}

// The composable never resolves this in a test: every scope stops before its debounced
// `watch` could fire the request, and none of these behaviours needs a network reply.
function neverRequested(): Promise<PricedBasket> {
  return new Promise(() => {})
}

function setup(products: SaleProduct[] = [aProduct()], over: Partial<TillBasketDeps> = {}) {
  const deps: TillBasketDeps = {
    venueId: ref('venue-1'),
    products: ref(products),
    selectedDiscountId: ref<string | null>(null),
    selectedTabHolderId: ref<string | null>(null),
    ticketLines: ref<TillBooking[]>([]),
    walkUpLines: ref([]),
    walkUpGuest: computed(() => null),
    ticketsPence: computed(() => 0),
    walkUpsPence: computed(() => 0),
    requestPrice: neverRequested,
    ...over,
  }
  const scope = effectScope()
  const basket = scope.run(() => useTillBasket(deps))!
  return { basket, deps, scope }
}

describe('tapping a variant twice merges into one line, up to the cap (F-103 criterion 2)', () => {
  test('the same variant and no choice merges quantity', () => {
    const { basket, scope } = setup()
    basket.tapVariant('Lager', aVariant())
    basket.tapVariant('Lager', aVariant())
    expect(basket.basket.value).toHaveLength(1)
    expect(basket.basket.value[0]!.qty).toBe(2)
    scope.stop()
  })

  test('a variant with a choice opens the picker rather than adding at once', () => {
    const { basket, scope } = setup()
    const withChoice = aVariant({ choice: { id: 'choice-1', name: 'Mixer', options: [{ id: 'opt-1', itemName: 'Tonic' }] } })
    basket.tapVariant('Gin', withChoice)
    expect(basket.basket.value).toHaveLength(0)
    expect(basket.choosing.value?.choice.name).toBe('Mixer')
    scope.stop()
  })

  test('choosing an option adds the line and closes the picker', () => {
    const { basket, scope } = setup()
    const withChoice = aVariant({ choice: { id: 'choice-1', name: 'Mixer', options: [{ id: 'opt-1', itemName: 'Tonic' }] } })
    basket.tapVariant('Gin', withChoice)
    basket.chooseOption('opt-1', 'Tonic')
    expect(basket.basket.value).toHaveLength(1)
    expect(basket.basket.value[0]!.choiceItemName).toBe('Tonic')
    expect(basket.choosing.value).toBeNull()
    scope.stop()
  })

  test('two different choices on the same variant are two lines', () => {
    const { basket, scope } = setup()
    const withChoice = aVariant({ choice: { id: 'choice-1', name: 'Mixer', options: [{ id: 'opt-1', itemName: 'Tonic' }, { id: 'opt-2', itemName: 'Soda' }] } })
    basket.tapVariant('Gin', withChoice)
    basket.chooseOption('opt-1', 'Tonic')
    basket.tapVariant('Gin', withChoice)
    basket.chooseOption('opt-2', 'Soda')
    expect(basket.basket.value).toHaveLength(2)
    scope.stop()
  })
})

describe('what a tap on a tile does depends on the product\'s sizes (F-103 criterion 1, 0083)', () => {
  test('one size with no choice adds to the basket at once', () => {
    const { basket, scope } = setup()
    basket.tapProduct(aProduct())
    expect(basket.basket.value).toHaveLength(1)
    expect(basket.basket.value[0]!.variantLabel).toBe('Pint')
    expect(basket.sizing.value).toBeNull()
    scope.stop()
  })

  test('one size offering a choice opens the mixer rather than the size sheet', () => {
    const { basket, scope } = setup()
    const withChoice = aVariant({ choice: { id: 'choice-1', name: 'Mixer', options: [{ id: 'opt-1', itemName: 'Tonic' }] } })
    basket.tapProduct(aProduct({ name: 'Gin', variants: [withChoice] }))
    expect(basket.basket.value).toHaveLength(0)
    expect(basket.sizing.value).toBeNull()
    expect(basket.choosing.value?.choice.name).toBe('Mixer')
    scope.stop()
  })

  test('several sizes open the size sheet and add nothing yet', () => {
    const { basket, scope } = setup()
    const wine = aProduct({
      name: 'House red',
      variants: [aVariant({ id: 'variant-175', label: '175ml glass', pricePence: 350 }), aVariant({ id: 'variant-250', label: '250ml glass', pricePence: 480 })],
    })
    basket.tapProduct(wine)
    expect(basket.basket.value).toHaveLength(0)
    expect(basket.sizing.value?.name).toBe('House red')
    scope.stop()
  })

  test('choosing a size from the sheet adds it and closes the sheet', () => {
    const { basket, scope } = setup()
    const small = aVariant({ id: 'variant-175', label: '175ml glass', pricePence: 350 })
    const wine = aProduct({ name: 'House red', variants: [small, aVariant({ id: 'variant-250', label: '250ml glass', pricePence: 480 })] })
    basket.tapProduct(wine)
    basket.tapVariant(wine.name, small)
    expect(basket.basket.value).toHaveLength(1)
    expect(basket.basket.value[0]!.variantLabel).toBe('175ml glass')
    expect(basket.sizing.value).toBeNull()
    scope.stop()
  })

  test('choosing a size that offers a choice opens the mixer next, with the size sheet gone', () => {
    const { basket, scope } = setup()
    const double = aVariant({ id: 'variant-double', label: 'Double', pricePence: 450, choice: { id: 'choice-1', name: 'Mixer', options: [{ id: 'opt-1', itemName: 'Tonic' }] } })
    const gin = aProduct({ name: 'Gin', variants: [aVariant({ id: 'variant-single', label: 'Single' }), double] })
    basket.tapProduct(gin)
    basket.tapVariant(gin.name, double)
    expect(basket.sizing.value).toBeNull()
    expect(basket.choosing.value?.choice.name).toBe('Mixer')
    expect(basket.basket.value).toHaveLength(0)
    basket.chooseOption('opt-1', 'Tonic')
    expect(basket.basket.value).toHaveLength(1)
    expect(basket.basket.value[0]!.choiceItemName).toBe('Tonic')
    scope.stop()
  })
})

describe('a restricted line is read off the catalogue, never asked for twice (F-106 criteria 1, 5)', () => {
  test('a basket with no age-restricted product needs no check', () => {
    const { basket, scope } = setup([aProduct({ ageRestricted: false })])
    basket.tapVariant('Lager', aVariant())
    expect(basket.needsAgeCheck.value).toBe(false)
    scope.stop()
  })

  test('one age-restricted product line needs a check even beside an unrestricted one', () => {
    const restricted = aProduct({ id: 'p-2', name: 'Wine', ageRestricted: true, variants: [aVariant({ id: 'variant-2', label: 'Small' })] })
    const { basket, scope } = setup([aProduct(), restricted])
    basket.tapVariant('Lager', aVariant())
    basket.tapVariant('Wine', aVariant({ id: 'variant-2', label: 'Small' }))
    expect(basket.needsAgeCheck.value).toBe(true)
    scope.stop()
  })
})

describe('saleBody sends exactly what the sale route and the SumUp hand-off both cross-check (F-104, F-124 criterion 2)', () => {
  test('the basket, the chosen discount and tab, and the expected total', () => {
    const { basket, scope } = setup([aProduct()], {
      selectedDiscountId: ref('discount-1'),
      selectedTabHolderId: ref('holder-1'),
    })
    basket.tapVariant('Lager', aVariant())
    const body = basket.saleBody(null, 500)
    expect(body).toEqual({
      venueId: 'venue-1',
      lines: [{ variantId: 'variant-1', qty: 1, choiceItemId: null }],
      expectedTotalPence: 500,
      ageCheck: null,
      discountId: 'discount-1',
      tabHolderId: 'holder-1',
      tickets: [],
      walkUps: [],
      walkUpGuest: null,
    })
    scope.stop()
  })
})

describe('expectedAfter shrinks to match a refusal, so the server\'s cross-check never refuses a figure nobody asked for (F-104, F-106)', () => {
  test('an accepted check keeps the full priced total', () => {
    const { basket, scope } = setup([aProduct({ ageRestricted: true })])
    basket.tapVariant('Lager', aVariant())
    basket.priced.value = aPriced({ totalPence: 500, lines: [{ variantId: 'variant-1', productName: 'Lager', variantLabel: 'Pint', choiceItemName: null, qty: 1, unitPricePence: 500, priceSource: 'variant', amountPence: 500, discountPence: 0 }] })
    const accepted: InlineAgeCheckInput = { outcome: 'ACCEPTED', idType: 'PASSPORT', reason: null, description: 'Checked at the till', notes: null }
    expect(basket.expectedAfter(accepted)).toBe(500)
    scope.stop()
  })

  test('a refusal drops the restricted line and keeps the rest', () => {
    const restricted = aProduct({ id: 'p-2', name: 'Wine', ageRestricted: true, variants: [aVariant({ id: 'variant-2', label: 'Small', pricePence: 300 })] })
    const { basket, scope } = setup([aProduct(), restricted])
    basket.tapVariant('Lager', aVariant())
    basket.tapVariant('Wine', aVariant({ id: 'variant-2', label: 'Small', pricePence: 300 }))
    basket.priced.value = aPriced({
      totalPence: 800,
      lines: [
        { variantId: 'variant-1', productName: 'Lager', variantLabel: 'Pint', choiceItemName: null, qty: 1, unitPricePence: 500, priceSource: 'variant', amountPence: 500, discountPence: 0 },
        { variantId: 'variant-2', productName: 'Wine', variantLabel: 'Small', choiceItemName: null, qty: 1, unitPricePence: 300, priceSource: 'variant', amountPence: 300, discountPence: 0 },
      ],
    })
    const refused: InlineAgeCheckInput = { outcome: 'REFUSED', idType: null, reason: 'APPEARED_UNDERAGE', description: 'Looked under 18', notes: null }
    expect(basket.expectedAfter(refused)).toBe(500)
    scope.stop()
  })

  test('ticket and walk-up money rides along even when the bar basket is empty', () => {
    const { basket, scope } = setup([], {
      ticketsPence: computed(() => 1200),
      walkUpsPence: computed(() => 300),
    })
    expect(basket.expectedAfter(null)).toBe(1500)
    scope.stop()
  })
})

// The charge button reads grandTotalPence, which reads priced: a failure that left the last
// good price in place would show a wrong figure as a right one.
describe('a pricing failure clears the total rather than leaving the last good figure (F-103 criterion 3)', () => {
  test('recomputeTotal nulls priced on a refused request', async () => {
    const { basket, scope } = setup([aProduct()], {
      requestPrice: () => Promise.reject(new Error('the price changed under this basket')),
    })
    basket.tapVariant('Lager', aVariant())
    basket.priced.value = aPriced({ totalPence: 500 })
    await basket.recomputeTotal()
    expect(basket.priced.value).toBeNull()
    expect(basket.priceFailure.value).toBeTruthy()
    expect(basket.grandTotalPence.value).toBeNull()
    scope.stop()
  })
})
