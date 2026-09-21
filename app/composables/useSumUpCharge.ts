import { computed, getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue'
import { usePendingPoll } from './usePendingPoll'
import { useSumUp } from './useSumUp'
import { refusalText } from '../utils/refusal'
import type { Ref } from 'vue'
import type { PricedLine, SaleReceipt, TillBooking } from '#shared/utils/sale'
import type { SumupAttemptStatus, SumupAttemptView } from '#shared/utils/sumup'
import type { TillSession } from '#shared/utils/till'
import type { BasketLine, WalkUpLine } from './useTillBasket'

// The screen-side half of a SumUp hand-off (F-124): the attempt lifecycle, the poll, the
// visibility listeners and what happens once an answer lands. `useSumUp` holds the device state.

export interface ChargedReceipt {
  totalPence: number
  refusedLines: PricedLine[]
  discount: SaleReceipt['discount']
  tab: SaleReceipt['tab']
  tickets: SaleReceipt['tickets']
  walkUps: SaleReceipt['walkUps']
  viaSumup: boolean
}

export type SumUpSnapshot = { bar: BasketLine[], tickets: TillBooking[], walkUps: WalkUpLine[], discountId: string | null }

// What the till reaches the payment routes with. A dependency rather than the `$fetch` global so
// the unit test can answer for the app (tests/unit/sumup-charge.test.ts).
export type SumUpRequest = <T>(path: string, options?: { method?: 'POST', body?: Record<string, unknown>, query?: Record<string, string> }) => Promise<T>

export interface SumUpChargeDeps {
  request: SumUpRequest
  venueId: Ref<string | null>
  sumupEnabled: Ref<boolean>
  selectedTabHolderId: Ref<string | null>
  session: Ref<TillSession | null>
  basket: Ref<BasketLine[]>
  ticketLines: Ref<TillBooking[]>
  walkUpLines: Ref<WalkUpLine[]>
  selectedDiscountId: Ref<string | null>
  charged: Ref<ChargedReceipt | null>
  chargeFailure: Ref<string | null>
  // The one place that knows what a fresh sale's discount and tab holder are (none), so this
  // does not keep its own copy of that rule (useTillBasket.ts).
  resetSelections: () => void
}

export function useSumUpCharge(deps: SumUpChargeDeps) {
  const { request, venueId, sumupEnabled, selectedTabHolderId, session, basket, ticketLines, walkUpLines, selectedDiscountId, charged, chargeFailure, resetSelections } = deps

  const sumup = useSumUp<SumUpSnapshot>()
  const sumupAvailable = computed(() => sumupEnabled.value && sumup.handheld.value && selectedTabHolderId.value === null)

  // While the app has the screen (criterion 5): asked on every return to the tab, and on a short
  // timer for a minute and a half, after which the "did it go through?" answers stay on offer.
  const waiting = ref<SumupAttemptView | null>(null)
  const waitingFailure = ref<string | null>(null)
  const resolving = ref(false)
  const smpTxCodeTyped = ref('')
  const pendingPoll = usePendingPoll()

  async function checkAttempt(): Promise<void> {
    const pending = sumup.pending.value
    if (!pending) return
    try {
      const answered = await request<{ attempt: SumupAttemptView }>(`/api/till/payments/${pending.id}`)
      waiting.value = answered.attempt
      waitingFailure.value = null
      settleAttempt(answered.attempt.status, pending)
    }
    catch (refused) {
      waitingFailure.value = refusalText(refused)
    }
  }

  // What the till does once an attempt has an answer: a success clears the basket, a failure or an
  // abandonment brings it back, a mismatch stays on screen with its reason (criteria 4, 5).
  function settleAttempt(status: SumupAttemptStatus, pending: NonNullable<typeof sumup.pending.value>): void {
    if (status === 'SUCCEEDED') {
      stopWatching()
      charged.value = { totalPence: pending.totalPence, refusedLines: [], discount: null, tab: null, tickets: [], walkUps: [], viaSumup: true }
      basket.value = []
      ticketLines.value = []
      walkUpLines.value = []
      resetSelections()
      sumup.forget()
      waiting.value = null
      void refreshOpenAttempts()
    }
    else if (status === 'FAILED' || status === 'ABANDONED') {
      stopWatching()
      basket.value = pending.basket.bar
      ticketLines.value = pending.basket.tickets
      walkUpLines.value = pending.basket.walkUps
      selectedDiscountId.value = pending.basket.discountId
      // After the restore has flushed: the till clears this on any basket edit, and the restore
      // itself is one (issue 1144).
      void nextTick(() => {
        chargeFailure.value = status === 'FAILED' ? 'The SumUp app reported the payment did not go through. The basket is back.' : 'That hand-off was abandoned. The basket is back; if the reader did take the money, ring it up again.'
      })
      sumup.forget()
      waiting.value = null
      void refreshOpenAttempts()
    }
    else if (status === 'MISMATCH') {
      stopWatching()
      void refreshOpenAttempts()
    }
  }

  // The short timer for a minute and a half, after which the "did it go through?" answers stay
  // on offer; a return to the tab checks again straight away regardless of the interval.
  function startWatching(): void {
    pendingPoll.start(checkAttempt, 3_000, 90_000)
  }

  function stopWatching(): void {
    pendingPoll.stop()
  }

  // Inside a component only: the unit test drives this with no instance, as useNightCache is.
  if (getCurrentInstance()) {
    onMounted(() => {
      if (sumup.recall()) {
        void checkAttempt()
        startWatching()
      }
    })
  }

  // "Did it go through?" (criterion 5), for the attempt this screen started or one listed below.
  async function resolveAttempt(id: string, outcome: 'succeeded' | 'abandoned', note: string | null = null): Promise<void> {
    resolving.value = true
    waitingFailure.value = null
    try {
      const answered = await request<{ status: SumupAttemptStatus, error: string | null }>(`/api/till/payments/${id}/resolve`, {
        method: 'POST',
        body: { outcome, smpTxCode: smpTxCodeTyped.value.trim() || null, note },
      })
      smpTxCodeTyped.value = ''
      const pending = sumup.pending.value
      if (pending && pending.id === id) {
        waiting.value = { ...(waiting.value ?? { id, status: answered.status, createdAt: 0, createdByName: null, expectedTotalPence: pending.totalPence, smpTxCode: null, smpMessage: null, smpFailureCause: null, error: null, entryId: null, resolution: null }), status: answered.status, error: answered.error }
        settleAttempt(answered.status, pending)
      }
      else {
        await refreshOpenAttempts()
      }
      if (answered.status === 'MISMATCH') waitingFailure.value = answered.error
    }
    catch (refused) {
      waitingFailure.value = refusalText(refused)
    }
    finally {
      resolving.value = false
    }
  }

  // A mismatch abandoned needs a note: the reader has money the ledger does not (criterion 4).
  const abandonNote = ref('')

  // Tonight's open hand-offs (criterion 6), so the laptop can answer for a phone that left one.
  const openAttempts = ref<SumupAttemptView[]>([])
  async function refreshOpenAttempts(): Promise<void> {
    if (!venueId.value || !sumupEnabled.value) return
    try {
      const answered = await request<{ attempts: SumupAttemptView[] }>('/api/till/payments', { query: { venueId: venueId.value } })
      openAttempts.value = answered.attempts.filter(attempt => attempt.id !== sumup.pending.value?.id)
    }
    catch { /* the strip is a convenience; the till still sells */ }
  }
  watch([session, sumupEnabled], () => {
    if (session.value) void refreshOpenAttempts()
  })

  return {
    sumup,
    sumupAvailable,
    waiting,
    waitingFailure,
    resolving,
    smpTxCodeTyped,
    abandonNote,
    openAttempts,
    checkAttempt,
    startWatching,
    resolveAttempt,
  }
}
