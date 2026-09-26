import { computed, ref } from 'vue'
import { pencePayable } from './useTillBasket'
import { usePendingPoll } from './usePendingPoll'
import { refusalData, refusalText } from '../utils/refusal'
import type { Ref } from 'vue'
import type { InlineAgeCheckInput } from '#shared/utils/age-checks'
import type { CompRequest } from '#shared/utils/comps'
import type { PricedBasket, SaleReceipt } from '#shared/utils/sale'

// A comp asked from the till (F-110): raise the request, then poll it whether or not the modal
// is open, so a decision made while it is closed is not missed; the modal only ever reopens onto it.

export interface TillCompLine { variantId: string, qty: number, choiceItemId: string | null }
interface SentLine extends TillCompLine { restricted: boolean }

export interface TillCompDeps {
  venueId: Ref<string | null>
  // Read once, at the moment of asking, and frozen from there (F-110 criterion 4).
  isLineRestricted: (line: TillCompLine) => boolean
  requestComp: (body: { venueId: string, lines: TillCompLine[], reason: string }) => Promise<{ id: string, priced: PricedBasket }>
  pollRequest: (id: string) => Promise<{ request: CompRequest }>
  giveComp: (id: string, body: { venueId: string, expectedForegonePence: number, ageCheck: InlineAgeCheckInput | null }) => Promise<SaleReceipt>
  // Reads the till's drinks again, for a line the server says asks where this till did not know.
  refreshCatalogue: () => Promise<void>
}

const POLL_MS = 4000
// A safety net against a runaway client poll, well past any request window a manager would
// configure; the server's own expiry is what actually ends the wait.
const POLL_CUTOFF_MS = 2 * 60 * 60 * 1000

export function useTillComp(deps: TillCompDeps) {
  const { venueId, isLineRestricted, requestComp, pollRequest, giveComp, refreshCatalogue } = deps

  const open = ref(false)
  const reason = ref('')
  const sending = ref(false)
  const sendFailure = ref<string | null>(null)
  const requestId = ref<string | null>(null)
  const request = ref<CompRequest | null>(null)
  const pollFailure = ref<string | null>(null)
  const givingBusy = ref(false)
  const giveFailure = ref<string | null>(null)
  const given = ref<SaleReceipt | null>(null)
  const pendingPoll = usePendingPoll()

  // What was actually asked for, frozen at the moment of asking: giving it later prices this,
  // never whatever the basket or the catalogue has become since (F-110 criterion 4).
  const sentLines = ref<SentLine[]>([])
  const sentPriced = ref<PricedBasket | null>(null)

  // Read from what was frozen at the ask, not the live catalogue: a product's restricted flag
  // changing while a request sits pending must never skip the prompt it was raised needing (F-106).
  const needsAgeCheck = computed(() => sentLines.value.some(line => line.restricted))
  const canGive = computed(() => request.value?.status === 'APPROVED' && !request.value.expired && given.value === null)
  const declined = computed(() => request.value?.status === 'DECLINED')
  const lapsed = computed(() => request.value !== null && request.value.status !== 'DECLINED' && request.value.expired && given.value === null)
  // Locks from the moment Ask is pressed, not only once it answers, or the modal's close control
  // could charge the same basket mid-flight; stays locked, given included, until the next sale.
  const locked = computed(() => sending.value || (requestId.value !== null && (given.value !== null || (!declined.value && !lapsed.value))))

  // A fresh ask if nothing is outstanding; otherwise this reopens onto the request already in
  // flight, whatever it has decided while the modal sat closed.
  function openModal(): void {
    open.value = true
    if (requestId.value !== null) return
    reason.value = ''
    sendFailure.value = null
    request.value = null
    pollFailure.value = null
    giveFailure.value = null
    given.value = null
    sentLines.value = []
    sentPriced.value = null
  }

  // Only ever called on a terminal request (given, declined or lapsed): frees the basket and the
  // chip for another ask. A request still pending or approved keeps its poll running regardless.
  function reset(): void {
    pendingPoll.stop()
    open.value = false
    reason.value = ''
    sendFailure.value = null
    requestId.value = null
    request.value = null
    pollFailure.value = null
    giveFailure.value = null
    given.value = null
    sentLines.value = []
    sentPriced.value = null
  }

  async function poll(): Promise<void> {
    if (!requestId.value) return
    try {
      const answered = await pollRequest(requestId.value)
      request.value = answered.request
      pollFailure.value = null
    }
    catch (refused) {
      pollFailure.value = refusalText(refused)
    }
    // Kept open through PENDING and APPROVED alike: an approved request can still lapse before
    // anyone gives it. A transport blip is kept open too, for the same next-tick chance.
    const active = !request.value || ((request.value.status === 'PENDING' || request.value.status === 'APPROVED') && !request.value.expired)
    if (given.value !== null || !active) pendingPoll.stop()
  }

  async function send(lines: TillCompLine[]): Promise<void> {
    if (!venueId.value || !reason.value.trim() || lines.length === 0) return
    sending.value = true
    sendFailure.value = null
    try {
      const answered = await requestComp({ venueId: venueId.value, lines, reason: reason.value.trim() })
      requestId.value = answered.id
      sentLines.value = lines.map(line => ({ ...line, restricted: isLineRestricted(line) }))
      sentPriced.value = answered.priced
      pendingPoll.start(poll, POLL_MS, POLL_CUTOFF_MS)
      void poll()
    }
    catch (refused) {
      sendFailure.value = refusalText(refused)
    }
    finally {
      sending.value = false
    }
  }

  // What is actually foregone once a restricted line is either checked or dropped (F-106), read
  // from the request's own frozen basket rather than the reader charge's live one.
  function foregonePence(ageCheck: InlineAgeCheckInput | null): number {
    if (!sentPriced.value) return 0
    return pencePayable(sentPriced.value, sentLines.value.map(line => line.restricted), ageCheck)
  }

  // True when the server asked for Challenge 25 on a line this till held as unrestricted: the lines
  // are marked from the catalogue read again, and only ever gain restriction (F-110 criterion 4).
  async function give(ageCheck: InlineAgeCheckInput | null): Promise<boolean> {
    if (!requestId.value || !venueId.value) return false
    givingBusy.value = true
    giveFailure.value = null
    try {
      given.value = await giveComp(requestId.value, { venueId: venueId.value, expectedForegonePence: foregonePence(ageCheck), ageCheck })
      pendingPoll.stop()
      return false
    }
    catch (refused) {
      if (refusalData<{ ageCheckFor?: string[] }>(refused)?.ageCheckFor?.length) {
        await refreshCatalogue()
        sentLines.value = sentLines.value.map(line => ({ ...line, restricted: line.restricted || isLineRestricted(line) }))
        if (needsAgeCheck.value) return true
      }
      giveFailure.value = refusalText(refused)
      return false
    }
    finally {
      givingBusy.value = false
    }
  }

  return {
    open,
    reason,
    sending,
    sendFailure,
    requestId,
    request,
    sentPriced,
    needsAgeCheck,
    canGive,
    declined,
    lapsed,
    locked,
    pollFailure,
    givingBusy,
    giveFailure,
    given,
    openModal,
    reset,
    send,
    give,
  }
}
