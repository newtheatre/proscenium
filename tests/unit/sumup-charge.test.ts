import { describe, expect, test } from 'bun:test'
import { effectScope, nextTick, ref, watch } from 'vue'
import { useSumUpCharge } from '#composables/useSumUpCharge'
import type { ChargedReceipt } from '#composables/useSumUpCharge'
import type { BasketLine, WalkUpLine } from '#composables/useTillBasket'
import type { TillBooking } from '#shared/utils/sale'
import type { TillSession } from '#shared/utils/till'

// F-124 criterion 5: an attempt the app reports failed or abandoned brings the basket back and
// says so. The till clears a charge failure on a basket edit; a restore is not one (issue 1144).

type Outcome = 'FAILED' | 'ABANDONED'

function aLine(): BasketLine {
  return { id: 'line-1', variantId: 'variant-1', productName: 'Lager', variantLabel: 'Pint', choiceItemId: null, choiceItemName: null, qty: 2 }
}

function setup(status: Outcome) {
  const scope = effectScope()
  const basket = ref<BasketLine[]>([])
  const chargeFailure = ref<string | null>(null)
  const deps = {
    // The app answering as the SumUp app told it: the attempt is over and the money never moved.
    request: async <T>() => ({ status, error: null }) as T,
    venueId: ref<string | null>(null),
    sumupEnabled: ref(true),
    selectedTabHolderId: ref<string | null>(null),
    session: ref<TillSession | null>(null),
    basket,
    ticketLines: ref<TillBooking[]>([]),
    walkUpLines: ref<WalkUpLine[]>([]),
    selectedDiscountId: ref<string | null>(null),
    charged: ref<ChargedReceipt | null>(null),
    chargeFailure,
    resetSelections: () => {},
  }
  const charge = scope.run(() => {
    // The till's own rule (app/pages/tonight/till/index.vue): editing the basket after a refusal
    // is the correction, so the message it was reading clears.
    watch(basket, () => {
      chargeFailure.value = null
    }, { deep: true })
    return useSumUpCharge(deps)
  })!
  return { charge, basket, chargeFailure, scope }
}

function handOff(charge: ReturnType<typeof setup>['charge'], id: string): void {
  charge.sumup.remember({ id, totalPence: 1000, startedAt: 0, basket: { bar: [aLine()], tickets: [], walkUps: [], discountId: null } })
}

describe('an attempt the app turned down brings the basket back, and says so (F-124 criterion 5)', () => {
  for (const status of ['FAILED', 'ABANDONED'] as const) {
    test(`${status.toLowerCase()} restores the basket and the message survives the restore`, async () => {
      const { charge, basket, chargeFailure, scope } = setup(status)
      handOff(charge, 'attempt-1')

      await charge.resolveAttempt('attempt-1', 'abandoned')
      await nextTick()
      await nextTick()

      expect(basket.value).toHaveLength(1)
      expect(chargeFailure.value).toContain('The basket is back')
      scope.stop()
    })
  }

  test('a later edit to the restored basket still clears the message', async () => {
    const { charge, basket, chargeFailure, scope } = setup('FAILED')
    handOff(charge, 'attempt-2')
    await charge.resolveAttempt('attempt-2', 'abandoned')
    await nextTick()
    await nextTick()
    expect(chargeFailure.value).not.toBeNull()

    basket.value = []
    await nextTick()
    expect(chargeFailure.value).toBeNull()
    scope.stop()
  })
})
