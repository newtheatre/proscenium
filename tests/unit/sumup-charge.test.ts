import { describe, expect, test } from 'bun:test'
import { effectScope, nextTick, ref, watch } from 'vue'
import { returnedAttemptKey } from '#composables/useSumUp'
import { useSumUpCharge } from '#composables/useSumUpCharge'
import { deviceNightCacheStore } from '#composables/useNightCache'
import type { ChargedReceipt } from '#composables/useSumUpCharge'
import type { BasketLine, WalkUpLine } from '#composables/useTillBasket'
import type { TillBooking } from '#shared/utils/sale'
import type { SumupAttemptView } from '#shared/utils/sumup'
import type { TillSession } from '#shared/utils/till'

// F-124 criterion 5: an attempt the app reports failed or abandoned brings the basket back and
// says so, once, in whichever tab on the phone gets there first (issues 1144, 1257).

type Outcome = 'FAILED' | 'ABANDONED'

function aLine(): BasketLine {
  return { id: 'line-1', variantId: 'variant-1', productName: 'Lager', variantLabel: 'Pint', choiceItemId: null, choiceItemName: null, qty: 2 }
}

function aView(id: string, status: Outcome): SumupAttemptView {
  return { id, status, createdAt: 0, createdByName: null, expectedTotalPence: 1000, smpTxCode: null, smpMessage: null, smpFailureCause: null, error: null, entryId: null, resolution: null }
}

// One till tab. Every tab in a test shares the device store, as tabs on one phone share storage.
function setup(status: Outcome, visible = ref(true)) {
  const scope = effectScope()
  const basket = ref<BasketLine[]>([])
  const chargeFailure = ref<string | null>(null)
  const deps = {
    // The app answering as the SumUp app told it: the attempt is over and the money never moved.
    request: async <T>(path: string) => {
      if (path.endsWith('/resolve')) return { status, error: null } as T
      if (path === '/api/till/payments') return { attempts: [] } as T
      return { attempt: aView(path.split('/').pop()!, status) } as T
    },
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
    isVisible: () => visible.value,
  }
  const charge = scope.run(() => {
    // The till's own rule (app/pages/tonight/till/index.vue): editing the basket after a refusal
    // is the correction, so the message it was reading clears.
    watch(basket, () => {
      chargeFailure.value = null
    }, { deep: true })
    return useSumUpCharge(deps)
  })!
  return { charge, basket, chargeFailure, scope, visible }
}

// The till keeps the basket on screen under the waiting card while the app has the phone.
function handOff(tab: ReturnType<typeof setup>, id: string): void {
  tab.basket.value = [aLine()]
  tab.charge.sumup.remember({ id, totalPence: 1000, startedAt: Date.now(), basket: { bar: [aLine()], tickets: [], walkUps: [], discountId: null } })
}

async function settled(): Promise<void> {
  await nextTick()
  await nextTick()
}

describe('an attempt the app turned down brings the basket back, and says so (F-124 criterion 5)', () => {
  for (const status of ['FAILED', 'ABANDONED'] as const) {
    test(`${status.toLowerCase()} restores the basket and the message survives the restore`, async () => {
      const tab = setup(status)
      handOff(tab, `attempt-1-${status}`)

      await tab.charge.resolveAttempt(`attempt-1-${status}`, 'abandoned')
      await settled()

      expect(tab.basket.value).toHaveLength(1)
      expect(tab.chargeFailure.value).toContain('The basket is back')
      tab.scope.stop()
    })
  }

  test('a later edit to the restored basket still clears the message', async () => {
    const tab = setup('FAILED')
    handOff(tab, 'attempt-2')
    await tab.charge.resolveAttempt('attempt-2', 'abandoned')
    await settled()
    expect(tab.chargeFailure.value).not.toBeNull()

    tab.basket.value = []
    await nextTick()
    expect(tab.chargeFailure.value).toBeNull()
    tab.scope.stop()
  })
})

describe('the first tab to restore the basket claims it; any other says so (F-124 criterion 5, issue 1257)', () => {
  test('the tab the charge started in restores it, and a new tab on the return link restores nothing', async () => {
    const started = setup('FAILED')
    const returned = setup('FAILED')
    handOff(started, 'attempt-claim-1')

    await started.charge.checkAttempt()
    await settled()
    await returned.charge.resume('attempt-claim-1')
    await settled()

    expect(started.basket.value).toHaveLength(1)
    expect(returned.basket.value).toHaveLength(0)
    expect(returned.charge.returnNotice.value).toContain('restored in another tab')
    started.scope.stop()
    returned.scope.stop()
  })

  test('a new tab on the return link restores it first, and the tab left behind empties its basket', async () => {
    const started = setup('FAILED')
    const returned = setup('FAILED')
    handOff(started, 'attempt-claim-2')

    await returned.charge.resume('attempt-claim-2')
    await settled()
    await started.charge.checkAttempt()
    await settled()

    expect(returned.basket.value).toHaveLength(1)
    expect(returned.chargeFailure.value).toContain('The basket is back')
    expect(started.basket.value).toHaveLength(0)
    expect(started.charge.returnNotice.value).toContain('restored in another tab')
    started.scope.stop()
    returned.scope.stop()
  })

  test('a tab in the background waits to be looked at, so the tab in front claims it', async () => {
    const inFront = ref(false)
    const started = setup('FAILED', inFront)
    const returned = setup('FAILED')
    handOff(started, 'attempt-claim-3')

    // The poll in the background tab sees the answer first, and keeps the basket rather than taking it.
    await started.charge.checkAttempt()
    await settled()
    expect(started.chargeFailure.value).toBeNull()
    expect(deviceNightCacheStore().getItem(returnedAttemptKey('attempt-claim-3'))).not.toBeNull()

    await returned.charge.resume('attempt-claim-3')
    await settled()
    expect(returned.basket.value).toHaveLength(1)

    inFront.value = true
    started.charge.returnToTab()
    await settled()
    expect(started.basket.value).toHaveLength(0)
    expect(started.charge.returnNotice.value).toContain('restored in another tab')
    started.scope.stop()
    returned.scope.stop()
  })

  test('a basket kept from an earlier show night is not brought back', async () => {
    const tab = setup('FAILED')
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
    deviceNightCacheStore().setItem(returnedAttemptKey('attempt-old'), JSON.stringify({
      id: 'attempt-old', totalPence: 1000, startedAt: twoDaysAgo, returnedAt: twoDaysAgo, status: 'FAILED', claimedBy: null,
      basket: { bar: [aLine()], tickets: [], walkUps: [], discountId: null },
    }))

    await tab.charge.resume('attempt-old')
    await settled()

    expect(tab.basket.value).toHaveLength(0)
    expect(deviceNightCacheStore().getItem(returnedAttemptKey('attempt-old'))).toBeNull()
    tab.scope.stop()
  })
})

describe('the restored basket offers Try SumUp again (F-124 criterion 5, F-104 criterion 3)', () => {
  test('offered with the restored basket, and gone once the message is', async () => {
    const tab = setup('FAILED')
    handOff(tab, 'attempt-retry-1')
    await tab.charge.checkAttempt()
    await settled()
    expect(tab.charge.retryOffered.value).toBe(true)

    tab.basket.value = []
    await settled()
    expect(tab.charge.retryOffered.value).toBe(false)
    tab.scope.stop()
  })

  test('never offered in a tab that did not restore the basket', async () => {
    const started = setup('FAILED')
    const returned = setup('FAILED')
    handOff(started, 'attempt-retry-2')
    await started.charge.checkAttempt()
    await returned.charge.resume('attempt-retry-2')
    await settled()

    expect(returned.charge.retryOffered.value).toBe(false)
    started.scope.stop()
    returned.scope.stop()
  })
})

describe('one tab restores a turned-down basket once, and only tonight\'s (F-124 criterion 5, 0014, issue 1257)', () => {
  test('two checks landing together restore it once and never say it went to another tab', async () => {
    const tab = setup('FAILED')
    handOff(tab, 'attempt-twice')

    // A return to the tab fires visibilitychange, focus and pageshow, each asking at once.
    await Promise.all([tab.charge.checkAttempt(), tab.charge.checkAttempt()])
    await settled()

    expect(tab.basket.value).toHaveLength(1)
    expect(tab.charge.returnNotice.value).toBeNull()
    expect(tab.chargeFailure.value).toContain('The basket is back')
    tab.scope.stop()
  })

  test('an attempt left in flight on an earlier show night is not resumed, so its basket never returns', async () => {
    const left = setup('ABANDONED')
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
    left.charge.sumup.remember({ id: 'attempt-left', totalPence: 1000, startedAt: twoDaysAgo, basket: { bar: [aLine()], tickets: [], walkUps: [], discountId: null } })
    left.scope.stop()

    const tonight = setup('ABANDONED')
    await tonight.charge.resume(null)
    await settled()

    expect(tonight.basket.value).toHaveLength(0)
    expect(tonight.charge.sumup.pending.value).toBeNull()
    expect(deviceNightCacheStore().getItem(returnedAttemptKey('attempt-left'))).toBeNull()
    tonight.scope.stop()
  })

  test('a kept record that will not read is pruned, and does not stop the others being pruned', async () => {
    const tab = setup('FAILED')
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
    deviceNightCacheStore().setItem(returnedAttemptKey('attempt-garbled'), '{not json')
    deviceNightCacheStore().setItem(returnedAttemptKey('attempt-stale'), JSON.stringify({ returnedAt: twoDaysAgo }))

    await tab.charge.resume(null)

    expect(deviceNightCacheStore().getItem(returnedAttemptKey('attempt-garbled'))).toBeNull()
    expect(deviceNightCacheStore().getItem(returnedAttemptKey('attempt-stale'))).toBeNull()
    tab.scope.stop()
  })
})
