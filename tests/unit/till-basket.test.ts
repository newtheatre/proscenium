import { describe, expect, test } from 'bun:test'
import { computed, effectScope, nextTick, ref } from 'vue'
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
    stock: null,
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

// The register write a refusal makes, captured rather than sent (F-106 criterion 6).
function recorder() {
  const recorded: { outcome: string, reason: string | null, description: string, product: string | null }[] = []
  return {
    recorded,
    record: (body: { outcome: string, reason: string | null, description: string, product: string | null }) => {
      recorded.push(body)
      return Promise.resolve()
    },
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
    recordAgeCheck: () => Promise.resolve(),
    online: ref(true),
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

// F-106 criterion 6 (issue 1150 item 5): the ask moves to the tap, so nobody pours first and
// checks afterwards.
describe('a restricted tap asks before the drink is poured (F-106 criterion 6)', () => {
  test('tapping a restricted variant asks, naming the product', () => {
    const { basket, scope } = setup([aProduct({ name: 'Gin', ageRestricted: true })])
    basket.tapVariant('Gin', aVariant())
    expect(basket.askingAgeCheckFor.value).toBe('Gin')
    scope.stop()
  })

  test('tapping an unrestricted variant asks nothing', () => {
    const { basket, scope } = setup([aProduct({ ageRestricted: false })])
    basket.tapVariant('Lager', aVariant())
    expect(basket.askingAgeCheckFor.value).toBeNull()
    scope.stop()
  })

  test('the restricted line is in the basket while the prompt is open, so nothing is lost by answering', () => {
    const { basket, scope } = setup([aProduct({ name: 'Gin', ageRestricted: true })])
    basket.tapVariant('Gin', aVariant())
    expect(basket.basket.value).toHaveLength(1)
    scope.stop()
  })

  test('a basket that already passed does not ask again in the same sale', () => {
    const second = aProduct({ id: 'p-2', name: 'Vodka', ageRestricted: true, variants: [aVariant({ id: 'variant-2', label: 'Single' })] })
    const { basket, scope } = setup([aProduct({ name: 'Gin', ageRestricted: true }), second])
    basket.tapVariant('Gin', aVariant())
    basket.acceptAgeCheck({ outcome: 'ACCEPTED', idType: 'PASSPORT', reason: null, description: 'Checked at the till', notes: null })
    expect(basket.askingAgeCheckFor.value).toBeNull()
    basket.tapVariant('Vodka', aVariant({ id: 'variant-2', label: 'Single' }))
    expect(basket.askingAgeCheckFor.value).toBeNull()
    scope.stop()
  })

  test('the accepted outcome is what the charge then sends, with no second prompt', () => {
    const { basket, scope } = setup([aProduct({ name: 'Gin', ageRestricted: true })])
    basket.tapVariant('Gin', aVariant())
    const accepted: InlineAgeCheckInput = { outcome: 'ACCEPTED', idType: 'PASSPORT', reason: null, description: 'Checked at the till', notes: null }
    basket.acceptAgeCheck(accepted)
    expect(basket.passedAgeCheck.value).toEqual(accepted)
    expect(basket.saleBody(basket.passedAgeCheck.value, 500).ageCheck).toEqual(accepted)
    scope.stop()
  })

  test('the next sale starts with nothing remembered', () => {
    const { basket, scope } = setup([aProduct({ name: 'Gin', ageRestricted: true })])
    basket.tapVariant('Gin', aVariant())
    basket.acceptAgeCheck({ outcome: 'ACCEPTED', idType: 'PASSPORT', reason: null, description: 'Checked at the till', notes: null })
    basket.resetBasket()
    expect(basket.passedAgeCheck.value).toBeNull()
    expect(basket.refusedLinesNote.value).toBeNull()
    scope.stop()
  })
})

describe('visibly over 25 settles the sale like a pass, with nothing to write (F-106 criterion 7, 0085)', () => {
  const visiblyOver: InlineAgeCheckInput = { outcome: 'NOT_REQUIRED', idType: null, reason: null, description: '', notes: null }

  test('a later restricted tap in the same sale does not ask again', () => {
    const second = aProduct({ id: 'p-2', name: 'Vodka', ageRestricted: true, variants: [aVariant({ id: 'variant-2', label: 'Single' })] })
    const { basket, scope } = setup([aProduct({ name: 'Gin', ageRestricted: true }), second])
    basket.tapVariant('Gin', aVariant())
    basket.acceptAgeCheck(visiblyOver)
    expect(basket.askingAgeCheckFor.value).toBeNull()
    basket.tapVariant('Vodka', aVariant({ id: 'variant-2', label: 'Single' }))
    expect(basket.askingAgeCheckFor.value).toBeNull()
    expect(basket.basket.value).toHaveLength(2)
    scope.stop()
  })

  test('the charge sends it, and the full total stands', () => {
    const { basket, scope } = setup([aProduct({ name: 'Gin', ageRestricted: true })])
    basket.tapVariant('Gin', aVariant())
    basket.priced.value = aPriced({ totalPence: 500, lines: [{ variantId: 'variant-1', productName: 'Gin', variantLabel: 'Pint', choiceItemName: null, qty: 1, unitPricePence: 500, priceSource: 'variant', amountPence: 500, discountPence: 0 }] })
    basket.acceptAgeCheck(visiblyOver)
    expect(basket.saleBody(basket.passedAgeCheck.value, 500).ageCheck).toEqual(visiblyOver)
    scope.stop()
  })
})

describe('a refusal at the tap takes the line back out and says so (F-106 criteria 3, 6)', () => {
  const refused: InlineAgeCheckInput = { outcome: 'REFUSED', idType: null, reason: 'NO_ID_SHOWN', description: 'Declined to show ID', notes: null }

  function mixed(over: Partial<TillBasketDeps> = {}) {
    const restricted = aProduct({ id: 'p-2', name: 'Gin', ageRestricted: true, variants: [aVariant({ id: 'variant-2', label: 'Single', pricePence: 300 })] })
    const made = setup([aProduct(), restricted], over)
    made.basket.tapVariant('Lager', aVariant())
    made.basket.tapVariant('Gin', aVariant({ id: 'variant-2', label: 'Single', pricePence: 300 }))
    return made
  }

  test('the restricted line goes and the rest of the basket stays', async () => {
    const { basket, scope } = mixed()
    await basket.refuseAgeCheck(refused)
    expect(basket.basket.value).toHaveLength(1)
    expect(basket.basket.value[0]!.productName).toBe('Lager')
    expect(basket.needsAgeCheck.value).toBe(false)
    scope.stop()
  })

  test('the screen says what is not being sold, naming the product', async () => {
    const { basket, scope } = mixed()
    await basket.refuseAgeCheck(refused)
    expect(basket.refusedLinesNote.value).toBe('ID refused. Not sold: Gin')
    scope.stop()
  })

  test('the refusal is written to the register there and then, naming the product', async () => {
    const register = recorder()
    const { basket, scope } = mixed({ recordAgeCheck: register.record })
    await basket.refuseAgeCheck(refused)
    expect(register.recorded).toHaveLength(1)
    expect(register.recorded[0]).toMatchObject({ outcome: 'REFUSED', reason: 'NO_ID_SHOWN', description: 'Declined to show ID', product: 'Gin' })
    scope.stop()
  })

  test('a refusal that could not be written says so, and the lines stay out', async () => {
    const { basket, scope } = mixed({ recordAgeCheck: () => Promise.reject(new Error('offline')) })
    await basket.refuseAgeCheck(refused)
    expect(basket.refusalRecordFailure.value).toBeTruthy()
    expect(basket.basket.value).toHaveLength(1)
    scope.stop()
  })

  test('a refusal is not a pass: a later restricted tap asks again', async () => {
    const { basket, scope } = mixed()
    await basket.refuseAgeCheck(refused)
    expect(basket.passedAgeCheck.value).toBeNull()
    basket.tapVariant('Gin', aVariant({ id: 'variant-2', label: 'Single', pricePence: 300 }))
    expect(basket.askingAgeCheckFor.value).toBe('Gin')
    scope.stop()
  })

  test('what is left is charged with no outcome attached, because the register already has it', async () => {
    const { basket, scope } = mixed()
    await basket.refuseAgeCheck(refused)
    expect(basket.saleBody(basket.passedAgeCheck.value, 500).ageCheck).toBeNull()
    scope.stop()
  })
})

// K-103, issue 1150 item 7: pricing is a round trip, so a dropped connection has to be a state
// the screen can say out loud rather than a request that never answers.
describe('pricing waits for the connection rather than hanging (K-103)', () => {
  function offlineSetup() {
    const asked: number[] = []
    const online = ref(false)
    const made = setup([aProduct()], {
      online,
      requestPrice: () => {
        asked.push(Date.now())
        return Promise.resolve(aPriced({ totalPence: 500 }))
      },
    })
    return { ...made, asked, online }
  }

  test('nothing is asked of the server while the connection is down', async () => {
    const { basket, asked, scope } = offlineSetup()
    basket.tapVariant('Lager', aVariant())
    await basket.recomputeTotal()
    expect(asked).toHaveLength(0)
    expect(basket.pricing.value).toBe(false)
    scope.stop()
  })

  test('the total is unknown rather than stale, and the screen knows why', async () => {
    const { basket, scope } = offlineSetup()
    basket.tapVariant('Lager', aVariant())
    basket.priced.value = aPriced({ totalPence: 500 })
    await basket.recomputeTotal()
    expect(basket.priced.value).toBeNull()
    expect(basket.grandTotalPence.value).toBeNull()
    expect(basket.offline.value).toBe(true)
    scope.stop()
  })

  test('a dropped connection is not a pricing refusal, so the basket says one thing, not two', async () => {
    const { basket, scope } = offlineSetup()
    basket.tapVariant('Lager', aVariant())
    await basket.recomputeTotal()
    expect(basket.priceFailure.value).toBeNull()
    scope.stop()
  })

  test('pricing resumes on reconnect, with nobody having to touch the basket', async () => {
    const { basket, asked, online, scope } = offlineSetup()
    basket.tapVariant('Lager', aVariant())
    await basket.recomputeTotal()
    online.value = true
    await nextTick()
    await Promise.resolve()
    expect(asked).toHaveLength(1)
    expect(basket.offline.value).toBe(false)
    scope.stop()
  })
})
