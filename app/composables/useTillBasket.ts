import { computed, ref, watch } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { MAX_BASKET_LINE_QTY } from '#shared/utils/sale'
import { refusalText, writeFailureText } from '../utils/refusal'
import type { ComputedRef, Ref } from 'vue'
import type { InlineAgeCheckInput, RefusalReason } from '#shared/utils/age-checks'
import type { PricedBasket, PricedLine, SaleChoice, SaleProduct, SaleVariant, TillBooking } from '#shared/utils/sale'

// A refusal drops the restricted lines from what is payable; shared by a reader charge
// (expectedAfter below) and a comp's own give (useTillComp.ts), so the two never diverge.
export function pencePayable(priced: PricedBasket, restricted: boolean[], ageCheck: InlineAgeCheckInput | null): number {
  if (ageCheck?.outcome !== 'REFUSED') return priced.totalPence
  return priced.lines
    .filter((_: PricedLine, index: number) => !restricted[index])
    .reduce((sum: number, line: PricedLine) => sum + line.amountPence - line.discountPence, 0)
}

// The basket, its server-recomputed price and what a charge submits, held apart from the
// tickets pane so it can be unit-tested without a device or a network (0004, F-103 criterion 3).

export interface BasketLine {
  id: string
  variantId: string
  productName: string
  variantLabel: string
  choiceItemId: string | null
  choiceItemName: string | null
  qty: number
}

export interface WalkUpLine { performanceId: string, showTitle: string, ticketTypeId: string, typeName: string, quantity: number, unitPrice: number }

export interface TillBasketDeps {
  venueId: Ref<string | null>
  products: Ref<SaleProduct[]>
  selectedDiscountId: Ref<string | null>
  selectedTabHolderId: Ref<string | null>
  ticketLines: Ref<TillBooking[]>
  walkUpLines: Ref<WalkUpLine[]>
  walkUpGuest: ComputedRef<{ name: string, email: string } | null>
  ticketsPence: ComputedRef<number>
  walkUpsPence: ComputedRef<number>
  // Injected rather than a bare $fetch, so the pure basket logic type-checks and runs under
  // bun:test with no Nuxt runtime beneath it (tests/tsconfig.json).
  requestPrice: (body: { venueId: string, lines: { variantId: string, qty: number, choiceItemId: string | null }[], discountId: string | null }) => Promise<PricedBasket>
  // Whether the device believes it can reach anything, injected so the offline behaviour is
  // testable without a browser (K-103).
  online: Ref<boolean>

  // A refusal at the tap may never reach a sale, so it goes on the register on its own
  // (F-106 criterion 6).
  recordAgeCheck: (body: { outcome: 'REFUSED', idType: null, reason: RefusalReason | null, description: string, notes: string | null, product: string | null, performanceId: null }) => Promise<unknown>
}

export function useTillBasket(deps: TillBasketDeps) {
  const { venueId, products, selectedDiscountId, selectedTabHolderId, ticketLines, walkUpLines, walkUpGuest, ticketsPence, walkUpsPence, requestPrice, recordAgeCheck, online } = deps

  const basket = ref<BasketLine[]>([])

  function addLine(productName: string, variant: SaleVariant, choiceItemId: string | null, choiceItemName: string | null): void {
    const existing = basket.value.find(line => line.variantId === variant.id && line.choiceItemId === choiceItemId)
    if (existing) existing.qty = Math.min(existing.qty + 1, MAX_BASKET_LINE_QTY)
    else {
      basket.value.push({
        id: crypto.randomUUID(),
        variantId: variant.id,
        productName,
        variantLabel: variant.label,
        choiceItemId,
        choiceItemName,
        qty: 1,
      })
    }
    askIfRestricted(productName, variant.id)
  }

  // Before the drink is poured, not at the charge (F-106 criterion 6). A sale that already
  // passed does not ask again; a refusal is not a pass, so a later restricted tap asks afresh.
  function askIfRestricted(productName: string, variantId: string): void {
    if (!isVariantRestricted(variantId) || passedAgeCheck.value) return
    refusalRecordFailure.value = null
    askingAgeCheckFor.value = productName
  }

  const choosing = ref<{ productName: string, variant: SaleVariant, choice: SaleChoice } | null>(null)
  const sizing = ref<SaleProduct | null>(null)

  // One tile per product, and what its tap does is the product's own shape (F-103 criterion 1,
  // 0083): add it, ask which size, or ask which mixer.
  function tapProduct(product: SaleProduct): void {
    const only = product.variants.length === 1 ? product.variants[0] : null
    if (only) {
      tapVariant(product.name, only)
      return
    }
    sizing.value = product
  }

  // A variant offering a choice prompts before the line lands, so the basket never holds an
  // unresolved mixer waiting to be asked about later (F-103 criterion 2).
  function tapVariant(productName: string, variant: SaleVariant): void {
    sizing.value = null
    if (variant.choice) {
      choosing.value = { productName, variant, choice: variant.choice }
      return
    }
    addLine(productName, variant, null, null)
  }

  function chooseOption(optionId: string, optionName: string): void {
    if (!choosing.value) return
    addLine(choosing.value.productName, choosing.value.variant, optionId, optionName)
    choosing.value = null
  }

  function incrementLine(line: BasketLine): void {
    line.qty = Math.min(line.qty + 1, MAX_BASKET_LINE_QTY)
  }

  function removeLine(line: BasketLine): void {
    basket.value = basket.value.filter(entry => entry.id !== line.id)
  }

  function decrementLine(line: BasketLine): void {
    if (line.qty <= 1) removeLine(line)
    else line.qty -= 1
  }

  const hasTicketMoney = computed(() => ticketLines.value.length > 0 || walkUpLines.value.length > 0)
  const basketEmpty = computed(() => basket.value.length === 0 && !hasTicketMoney.value)

  // Every rule that makes a chosen discount or tab holder impossible lands here, so the next
  // one changes this function rather than adding another watch (F-122 criterion 5).
  function resetInvalidSelections(): void {
    if (hasTicketMoney.value) selectedTabHolderId.value = null
  }
  watch(hasTicketMoney, resetInvalidSelections)

  // A fresh sale starts with neither chosen, unconditionally rather than only when invalid.
  function resetSelections(): void {
    selectedDiscountId.value = null
    selectedTabHolderId.value = null
  }

  const priced = ref<PricedBasket | null>(null)
  const pricing = ref(false)
  const priceFailure = ref<string | null>(null)

  // Pricing is a round trip, so with nothing to reach the total is unknown, not stale and not a
  // refusal: the screen says so and the charge waits (K-103, issue 1150 item 7).
  const offline = computed(() => !online.value)

  // Recomputed server-side on every change, never trusted from what the screen last showed (0004,
  // F-103 criterion 3). The caller debounces the calls; this only ever does one at a time.
  async function recomputeTotal(): Promise<void> {
    if (basket.value.length === 0 || !venueId.value) {
      priced.value = null
      priceFailure.value = null
      return
    }
    if (!online.value) {
      priced.value = null
      priceFailure.value = null
      pricing.value = false
      return
    }
    pricing.value = true
    priceFailure.value = null
    try {
      priced.value = await requestPrice({
        venueId: venueId.value,
        lines: basket.value.map(line => ({ variantId: line.variantId, qty: line.qty, choiceItemId: line.choiceItemId })),
        discountId: selectedDiscountId.value,
      })
    }
    catch (refused) {
      priceFailure.value = refusalText(refused)
      // The pinned charge button reads this too: a failure leaving the last good figure in
      // place would show a wrong total as a right one (F-103 criterion 3).
      priced.value = null
    }
    finally {
      pricing.value = false
    }
  }

  // Nobody should have to touch the basket to get a total back once the connection returns.
  watch(online, (up) => {
    if (up) void recomputeTotal()
  })

  let priceTimer: ReturnType<typeof setTimeout> | undefined

  // Debounced, so a run of taps costs one request rather than one each.
  watch([basket, selectedDiscountId], () => {
    clearTimeout(priceTimer)
    if (basket.value.length === 0) {
      priced.value = null
      priceFailure.value = null
      return
    }
    priceTimer = setTimeout(() => void recomputeTotal(), 250)
  }, { deep: true })

  // The one figure the reader takes (F-122 criterion 3): the bar net of any discount, plus every
  // booking's amount owed and every walk-up, none of which a discount touches (criterion 4).
  const grandTotalPence = computed(() => (basket.value.length ? priced.value?.totalPence ?? null : 0) === null
    ? null
    : (basket.value.length ? priced.value!.totalPence : 0) + ticketsPence.value + walkUpsPence.value)

  // A restricted line is the product's flag, already on the catalogue this screen holds: no second
  // lookup, and no route sells one without an outcome on record first (F-106 criteria 1, 5).
  function isVariantRestricted(variantId: string): boolean {
    return products.value.some(product => product.ageRestricted && product.variants.some(variant => variant.id === variantId))
  }
  function isRestricted(line: BasketLine): boolean {
    return isVariantRestricted(line.variantId)
  }
  const needsAgeCheck = computed(() => basket.value.some(isRestricted))

  // What this sale has already settled, what it is asking about now, and what a refusal left
  // behind for the screen to say (F-106 criterion 6).
  const passedAgeCheck = ref<InlineAgeCheckInput | null>(null)
  const askingAgeCheckFor = ref<string | null>(null)
  const refusedLinesNote = ref<string | null>(null)
  const refusalRecordFailure = ref<string | null>(null)

  function acceptAgeCheck(outcome: InlineAgeCheckInput): void {
    passedAgeCheck.value = outcome
    askingAgeCheckFor.value = null
  }

  // The lines go at once, and the register entry is written here rather than riding on a sale
  // that may never be made: a basket left with nothing in it still owes the licence a record.
  async function refuseAgeCheck(outcome: InlineAgeCheckInput): Promise<void> {
    const removed = basket.value.filter(isRestricted)
    const names = [...new Set(removed.map(line => line.productName))].join(', ')
    basket.value = basket.value.filter(line => !isRestricted(line))
    askingAgeCheckFor.value = null
    refusedLinesNote.value = names ? `Not sold, on the ID refusal: ${names}` : null
    refusalRecordFailure.value = null
    try {
      await recordAgeCheck({
        outcome: 'REFUSED',
        idType: null,
        reason: outcome.reason,
        description: outcome.description,
        notes: outcome.notes,
        product: names || null,
        performanceId: null,
      })
    }
    catch (failed) {
      refusalRecordFailure.value = writeFailureText(failed, 'Write this refusal up on the age checks screen.')
    }
  }

  function lineAmount(line: BasketLine): string | null {
    const index = basket.value.findIndex(entry => entry.id === line.id)
    const amount = priced.value?.lines[index]?.amountPence
    return amount === undefined ? null : saysMoney(amount)
  }

  // What every charge sends, whichever way the money is taken: the same body the sale route and
  // the hand-off both cross-check (F-104, F-124 criterion 2).
  function saleBody(ageCheck: InlineAgeCheckInput | null, expectedTotalPence: number) {
    return {
      venueId: venueId.value,
      lines: basket.value.map(line => ({ variantId: line.variantId, qty: line.qty, choiceItemId: line.choiceItemId })),
      expectedTotalPence,
      ageCheck,
      discountId: selectedDiscountId.value,
      tabHolderId: selectedTabHolderId.value,
      tickets: ticketLines.value.map(booking => ({ reservationId: booking.id })),
      walkUps: walkUpLines.value.map(line => ({ performanceId: line.performanceId, ticketTypeId: line.ticketTypeId, quantity: line.quantity })),
      walkUpGuest: walkUpGuest.value,
    }
  }

  // A refusal drops the restricted lines: what the screen expects to be charged has to shrink to
  // match, or the server's own cross-check would refuse a total nobody asked for (F-104, F-106).
  function expectedAfter(ageCheck: InlineAgeCheckInput | null): number {
    const bar = basket.value.length === 0 ? 0 : pencePayable(priced.value!, basket.value.map(isRestricted), ageCheck)
    return bar + ticketsPence.value + walkUpsPence.value
  }

  function resetBasket(): void {
    basket.value = []
    priced.value = null
    passedAgeCheck.value = null
    askingAgeCheckFor.value = null
    refusedLinesNote.value = null
    refusalRecordFailure.value = null
  }

  return {
    basket,
    choosing,
    sizing,
    tapProduct,
    tapVariant,
    chooseOption,
    incrementLine,
    decrementLine,
    removeLine,
    hasTicketMoney,
    basketEmpty,
    priced,
    pricing,
    priceFailure,
    offline,
    recomputeTotal,
    grandTotalPence,
    isRestricted,
    isVariantRestricted,
    needsAgeCheck,
    passedAgeCheck,
    askingAgeCheckFor,
    refusedLinesNote,
    refusalRecordFailure,
    acceptAgeCheck,
    refuseAgeCheck,
    lineAmount,
    saleBody,
    expectedAfter,
    resetBasket,
    resetInvalidSelections,
    resetSelections,
  }
}
