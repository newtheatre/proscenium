<script setup lang="ts">
import { formatLondon, londonClock } from '#shared/utils/london'
import { ID_TYPES, REFUSAL_REASONS, saysIdType, saysRefusalReason } from '#shared/utils/age-checks'
import { says, saysMoney } from '#shared/utils/bar'
import { saysAttemptStatus } from '#shared/utils/sumup'
import type { IdType, InlineAgeCheckInput, RefusalReason } from '#shared/utils/age-checks'
import type { PricedBasket, PricedLine, SaleProduct, SaleReceipt, TillBooking, WalkUpOption } from '#shared/utils/sale'
import type { SumupAttemptStatus, SumupAttemptView } from '#shared/utils/sumup'
import type { BasketLine, WalkUpLine } from '~/composables/useTillBasket'
import type { ScannerFailure } from '~/composables/useQrScanner'

definePageMeta({ layout: 'tonight', docs: '/docs/show-night/the-till' })
useSeoMeta({ title: 'Till' })

// The guard is the route's, not this screen's: what a refusal says is written where it is
// raised, so this only ever displays it (E-111 criterion 5).
const {
  syncedAt,
  failure,
  busy,
  session,
  venueId,
  sumupEnabled,
  open,
  closeModalOpen,
  reconciliation,
  reconciliationLoading,
  reconciliationFailure,
  actualZPounds,
  varianceNote,
  closingBusy,
  closeFailure,
  variancePreviewPence,
  openCloseModal,
  confirmClose,
} = useTillSession()

// The catalogue, held on the device so venue Wi-Fi dropping mid-service never blanks the grid
// (K-103).
const {
  catalogue,
  categories,
  products,
  productsIn,
  discounts,
  selectedDiscountId,
  tabHolders,
  selectedTabHolderId,
} = useTillCatalogue(session, venueId)

// Two panes over one basket (F-122): the drinks grid, and the bookings and walk-ups.
const pane = ref<'bar' | 'tickets'>('bar')

// The Tickets pane's lookup: the camera (E-129's scanner), a reference, or a name.
const cameraOpen = ref(false)
const cameraNote = ref<string | null>(null)
const lookupTerm = ref('')
const lookingUp = ref(false)
const lookupFailure = ref<string | null>(null)
const found = ref<TillBooking[]>([])

const cameraSays: Record<ScannerFailure, string> = {
  NO_CAMERA: 'No camera on this device, so type the reference or a name.',
  REFUSED: 'Camera access refused, so type the reference or a name. Allow it in the site settings to scan.',
  BROKEN: 'The camera would not start, so type the reference or a name.',
}

function openCamera(): void {
  cameraNote.value = null
  lookupFailure.value = null
  cameraOpen.value = true
}

function fallBackToTyping(failure: ScannerFailure): void {
  cameraOpen.value = false
  cameraNote.value = cameraSays[failure]
}

async function lookUp(): Promise<void> {
  const q = lookupTerm.value.trim()
  if (q.length < 2 || !venueId.value) return
  lookingUp.value = true
  lookupFailure.value = null
  found.value = []
  try {
    const answered = await $fetch<{ bookings: TillBooking[] }>('/api/till/bookings', { query: { venueId: venueId.value, q } })
    found.value = answered.bookings
    if (found.value.length === 0) lookupFailure.value = `Nothing matching "${q}" on tonight's performances here.`
  }
  catch (refused) {
    lookupFailure.value = refusalText(refused)
  }
  finally {
    lookingUp.value = false
  }
}

async function scanDecoded(value: string): Promise<void> {
  if (lookingUp.value || !venueId.value) return
  cameraOpen.value = false
  lookingUp.value = true
  lookupFailure.value = null
  found.value = []
  try {
    const answered = await $fetch<{ booking: TillBooking }>('/api/till/bookings/scan', {
      method: 'POST',
      body: { venueId: venueId.value, scanned: value.trim() },
    })
    found.value = [answered.booking]
  }
  catch (refused) {
    lookupFailure.value = refusalText(refused)
  }
  finally {
    lookingUp.value = false
  }
}

// Bookings whose money is in the basket (F-122 criterion 2): each once, and only a pending one.
const ticketLines = ref<TillBooking[]>([])
const ticketsPence = computed(() => ticketLines.value.reduce((sum, booking) => sum + booking.owedPence, 0))

function addBooking(booking: TillBooking): void {
  if (booking.refusal || ticketLines.value.some(line => line.id === booking.id)) return
  ticketLines.value.push(booking)
  found.value = []
  lookupTerm.value = ''
}

function removeBooking(id: string): void {
  ticketLines.value = ticketLines.value.filter(line => line.id !== id)
}

// A walk-up (F-123): one of tonight's houses here, a type at a quantity, and an optional guest.
const authority = useNightAuthority()
const walkUpPerformanceId = ref<string | undefined>(undefined)
const walkUpOptions = ref<WalkUpOption[]>([])
const walkUpOptionsFailure = ref<string | null>(null)
const walkUpQty = ref<Record<string, number>>({})
const walkUpGuestName = ref('')
const walkUpGuestEmail = ref('')

const walkUpLines = ref<WalkUpLine[]>([])
const walkUpsPence = computed(() => walkUpLines.value.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0))

const tonightsPerformances = computed(() => authority.value.performances)
watch(tonightsPerformances, (performances) => {
  if (!walkUpPerformanceId.value && performances.length === 1) walkUpPerformanceId.value = performances[0]!.id
}, { immediate: true })

watch(walkUpPerformanceId, async (performanceId) => {
  walkUpOptions.value = []
  walkUpQty.value = {}
  walkUpOptionsFailure.value = null
  if (!performanceId || !venueId.value) return
  try {
    const answered = await $fetch<{ options: WalkUpOption[] }>('/api/till/walk-up-options', { query: { venueId: venueId.value, performanceId } })
    walkUpOptions.value = answered.options
  }
  catch (refused) {
    walkUpOptionsFailure.value = refusalText(refused)
  }
})

function bumpWalkUp(typeId: string, by: number): void {
  walkUpQty.value[typeId] = Math.max(0, Math.min(20, (walkUpQty.value[typeId] ?? 0) + by))
}

function addWalkUps(): void {
  const performance = tonightsPerformances.value.find(one => one.id === walkUpPerformanceId.value)
  if (!performance) return
  for (const option of walkUpOptions.value) {
    const quantity = walkUpQty.value[option.id] ?? 0
    if (quantity === 0) continue
    const existing = walkUpLines.value.find(line => line.performanceId === performance.id && line.ticketTypeId === option.id)
    if (existing) existing.quantity = Math.min(20, existing.quantity + quantity)
    else walkUpLines.value.push({ performanceId: performance.id, showTitle: performance.showTitle, ticketTypeId: option.id, typeName: option.name, quantity, unitPrice: option.price })
  }
  walkUpQty.value = {}
}

function removeWalkUp(line: WalkUpLine): void {
  walkUpLines.value = walkUpLines.value.filter(entry => entry !== line)
}

const walkUpGuest = computed(() => {
  const name = walkUpGuestName.value.trim()
  const email = walkUpGuestEmail.value.trim()
  return name && email ? { name, email } : null
})
const walkUpGuestIncomplete = computed(() => Boolean(walkUpGuestName.value.trim()) !== Boolean(walkUpGuestEmail.value.trim()))

const {
  basket,
  choosing,
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
  recomputeTotal,
  grandTotalPence,
  needsAgeCheck,
  lineAmount,
  saleBody,
  expectedAfter,
  resetBasket,
} = useTillBasket({
  venueId,
  products,
  selectedDiscountId,
  selectedTabHolderId,
  ticketLines,
  walkUpLines,
  walkUpGuest,
  ticketsPence,
  walkUpsPence,
  requestPrice: body => $fetch<PricedBasket>('/api/till/price', { method: 'POST', body }),
})

const charging = ref(false)
const chargeFailure = ref<string | null>(null)
const charged = ref<{
  totalPence: number
  refusedLines: PricedLine[]
  discount: SaleReceipt['discount']
  tab: SaleReceipt['tab']
  tickets: SaleReceipt['tickets']
  walkUps: SaleReceipt['walkUps']
  viaSumup: boolean
} | null>(null)

type AgeCheckStep = 'closed' | 'choose' | 'refuse'
const ageCheckStep = ref<AgeCheckStep>('closed')
const ageCheckReason = ref<RefusalReason | null>(null)
const ageCheckDescription = ref('')
const ageCheckError = ref<string | null>(null)

function resetAgeCheck(): void {
  ageCheckStep.value = 'closed'
  ageCheckReason.value = null
  ageCheckDescription.value = ''
  ageCheckError.value = null
}

function readyToCharge(): boolean {
  if (!venueId.value || basketEmpty.value || walkUpGuestIncomplete.value) return false
  return basket.value.length === 0 || priced.value !== null
}

type Snapshot = { bar: BasketLine[], tickets: TillBooking[], walkUps: WalkUpLine[], discountId: string | null }
const sumup = useSumUp<Snapshot>()
const sumupAvailable = computed(() => sumupEnabled.value && sumup.handheld.value && selectedTabHolderId.value === null)

// Which path the Challenge 25 prompt was opened for, so its answer goes the same way.
const chargeVia = ref<'reader' | 'sumup'>('reader')

// The submission step (F-104, F-105, 0004). A restricted line with no outcome yet opens the
// Challenge 25 prompt (F-106); a tab holder chosen below charges credit, not the reader (F-108).
async function charge(ageCheck: InlineAgeCheckInput | null = null): Promise<void> {
  if (!readyToCharge()) return
  if (!ageCheck && needsAgeCheck.value) {
    chargeVia.value = 'reader'
    ageCheckStep.value = 'choose'
    return
  }

  charging.value = true
  chargeFailure.value = null
  try {
    const answered = await $fetch<SaleReceipt>('/api/till/sale', { method: 'POST', body: saleBody(ageCheck, expectedAfter(ageCheck)) })
    charged.value = {
      totalPence: answered.totalPence,
      refusedLines: answered.refusedLines,
      discount: answered.discount,
      tab: answered.tab,
      tickets: answered.tickets,
      walkUps: answered.walkUps,
      viaSumup: false,
    }
    resetAgeCheck()
  }
  catch (refused) {
    chargeFailure.value = refusalText(refused)
    resetAgeCheck()
    // The refusal already names the true figure; catch the total up to it too, so what is shown
    // under the message is the one a retry would now send (F-104 criterion 3, no bypass).
    await recomputeTotal()
  }
  finally {
    charging.value = false
  }
}

// The hand-off (F-124 criterion 1): the basket is held on an attempt and the SumUp app opens;
// what this screen remembers is enough to bring the basket back if the app says no.
async function chargeOnSumUp(ageCheck: InlineAgeCheckInput | null = null): Promise<void> {
  if (!readyToCharge()) return
  if (!ageCheck && needsAgeCheck.value) {
    chargeVia.value = 'sumup'
    ageCheckStep.value = 'choose'
    return
  }

  charging.value = true
  chargeFailure.value = null
  try {
    const expectedTotalPence = expectedAfter(ageCheck)
    const started = await $fetch<{ id: string, launchUrl: string, totalPence: number }>('/api/till/payments', {
      method: 'POST',
      body: saleBody(ageCheck, expectedTotalPence),
    })
    sumup.remember({
      id: started.id,
      totalPence: started.totalPence,
      startedAt: Date.now(),
      basket: { bar: basket.value, tickets: ticketLines.value, walkUps: walkUpLines.value, discountId: selectedDiscountId.value },
    })
    resetAgeCheck()
    startWatching()
    sumup.launch(started.launchUrl)
  }
  catch (refused) {
    chargeFailure.value = refusalText(refused)
    resetAgeCheck()
    await recomputeTotal()
  }
  finally {
    charging.value = false
  }
}

// While the app has the screen (criterion 5): asked on every return to the tab, and on a short
// timer for a minute and a half, after which the "did it go through?" answers stay on offer.
const waiting = ref<SumupAttemptView | null>(null)
const waitingFailure = ref<string | null>(null)
const resolving = ref(false)
const smpTxCodeTyped = ref('')
let watchTimer: ReturnType<typeof setInterval> | undefined
let watchUntil = 0

async function checkAttempt(): Promise<void> {
  const pending = sumup.pending.value
  if (!pending) return
  try {
    const answered = await $fetch<{ attempt: SumupAttemptView }>(`/api/till/payments/${pending.id}`)
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
    selectedDiscountId.value = null
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
    chargeFailure.value = status === 'FAILED' ? 'The SumUp app reported the payment did not go through. The basket is back.' : 'That hand-off was abandoned. The basket is back; if the reader did take the money, ring it up again.'
    sumup.forget()
    waiting.value = null
    void refreshOpenAttempts()
  }
  else if (status === 'MISMATCH') {
    stopWatching()
    void refreshOpenAttempts()
  }
}

function startWatching(): void {
  stopWatching()
  watchUntil = Date.now() + 90_000
  watchTimer = setInterval(() => {
    if (Date.now() > watchUntil) {
      stopWatching()
      return
    }
    void checkAttempt()
  }, 3_000)
}

function stopWatching(): void {
  if (watchTimer) clearInterval(watchTimer)
  watchTimer = undefined
}

function onReturnToTab(): void {
  if (document.visibilityState === 'visible' && sumup.pending.value) void checkAttempt()
}

onMounted(() => {
  if (sumup.recall()) {
    void checkAttempt()
    startWatching()
  }
  document.addEventListener('visibilitychange', onReturnToTab)
  window.addEventListener('focus', onReturnToTab)
  window.addEventListener('pageshow', onReturnToTab)
})

onBeforeUnmount(() => {
  stopWatching()
  document.removeEventListener('visibilitychange', onReturnToTab)
  window.removeEventListener('focus', onReturnToTab)
  window.removeEventListener('pageshow', onReturnToTab)
})

// "Did it go through?" (criterion 5), for the attempt this screen started or one listed below.
async function resolveAttempt(id: string, outcome: 'succeeded' | 'abandoned', note: string | null = null): Promise<void> {
  resolving.value = true
  waitingFailure.value = null
  try {
    const answered = await $fetch<{ status: SumupAttemptStatus, error: string | null }>(`/api/till/payments/${id}/resolve`, {
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
    const answered = await $fetch<{ attempts: SumupAttemptView[] }>('/api/till/payments', { query: { venueId: venueId.value } })
    openAttempts.value = answered.attempts.filter(attempt => attempt.id !== sumup.pending.value?.id)
  }
  catch { /* the strip is a convenience; the till still sells */ }
}
watch([session, sumupEnabled], () => {
  if (session.value) void refreshOpenAttempts()
})

function timeOf(at: number): string {
  return formatLondon(new Date(at * 1000), { timeStyle: 'short' })
}

// Two taps for the routine pass case (F-106 criterion 2): the ID type button both records the
// outcome and submits, with a description staff can edit before choosing it if it matters here.
function acceptAgeCheck(idType: IdType): void {
  const outcome: InlineAgeCheckInput = { outcome: 'ACCEPTED', idType, reason: null, description: ageCheckDescription.value.trim() || 'Checked at the till', notes: null }
  void (chargeVia.value === 'sumup' ? chargeOnSumUp(outcome) : charge(outcome))
}

function refuseAgeCheck(): void {
  if (!ageCheckReason.value) {
    ageCheckError.value = 'Say why, because a refusal needs a reason on the record'
    return
  }
  if (!ageCheckDescription.value.trim()) {
    ageCheckError.value = 'Describe who you checked, never by name'
    return
  }
  ageCheckError.value = null
  const outcome: InlineAgeCheckInput = { outcome: 'REFUSED', idType: null, reason: ageCheckReason.value, description: ageCheckDescription.value.trim(), notes: null }
  void (chargeVia.value === 'sumup' ? chargeOnSumUp(outcome) : charge(outcome))
}

function nextSale(): void {
  resetBasket()
  ticketLines.value = []
  walkUpLines.value = []
  walkUpGuestName.value = ''
  walkUpGuestEmail.value = ''
  found.value = []
  lookupTerm.value = ''
  charged.value = null
  chargeFailure.value = null
  selectedDiscountId.value = null
  selectedTabHolderId.value = null
  pane.value = 'bar'
  resetAgeCheck()
}

// A walk-up's door pass, printed from the counter laptop (F-123 criterion 4).
function printPass(): void {
  window.print()
}

// Editing the basket after a refusal is the correction; the message it was reading no longer
// describes what would be resubmitted, so it clears rather than going stale.
watch(basket, () => {
  chargeFailure.value = null
}, { deep: true })

// Opening the note never leaves the sale: this is a modal over the basket, never a navigation, so
// what was tapped in is still there on return (F-107 criterion 2).
const allergenOpen = ref<{ name: string, state: SaleProduct['allergenState'], note: string | null } | null>(null)
</script>

<template>
  <div>
    <NightScreen
      title="Till"
      :hint="session
        ? 'Tap a size to add it. Quantities and lines are editable before payment.'
        : 'Opening the till is one session for the whole night. Everyone at this venue sells against it.'"
      :stale="session ? catalogue.cachedAt.value : syncedAt"
      :busy="busy || catalogue.pending.value"
    >
      <UAlert
        v-if="failure"
        data-test="till-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <div
        v-else-if="session"
        class="space-y-6"
      >
        <p
          data-test="till-open"
          class="text-xs text-muted"
        >
          Open since {{ londonClock(new Date(session.openedAt * 1000)) }}.
        </p>

        <UAlert
          v-if="catalogue.error.value"
          data-test="catalogue-failure"
          color="warning"
          variant="subtle"
          description="Showing what was last loaded; the till could not refresh just now."
        />

        <p
          v-if="catalogue.data.value && products.length === 0"
          data-test="catalogue-empty"
          class="text-sm text-muted"
        >
          Nothing is on the till yet. Price a size in the catalogue, and it appears here.
        </p>

        <!-- A hand-off the SumUp app has not answered for (F-124 criterion 5). -->
        <NightBlock
          v-if="sumup.pending.value && !charged"
          title="Waiting for SumUp"
          data-test="sumup-waiting"
        >
          <p class="text-lg font-semibold">
            {{ saysMoney(sumup.pending.value.totalPence) }} handed to the SumUp app.
          </p>
          <p
            class="mt-1 text-sm text-muted"
            data-test="sumup-waiting-status"
          >
            {{ waiting ? saysAttemptStatus(waiting.status) : 'Not answered yet.' }}
            <span v-if="waiting?.status === 'MISMATCH'">{{ waiting.error }}</span>
          </p>
          <UAlert
            v-if="waitingFailure"
            class="mt-2"
            color="error"
            variant="subtle"
            :description="waitingFailure"
            data-test="sumup-waiting-failure"
          />
          <p class="mt-3 text-sm">
            Did the payment go through on the reader?
          </p>
          <UInput
            v-model="smpTxCodeTyped"
            placeholder="Transaction code from the SumUp app (optional)"
            class="mt-2 w-full"
            data-test="sumup-tx-code"
          />
          <UTextarea
            v-if="waiting?.status === 'MISMATCH'"
            v-model="abandonNote"
            placeholder="If you are abandoning this: what happened to the money the reader took?"
            class="mt-2 w-full"
            data-test="sumup-abandon-note"
          />
          <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <UButton
              color="primary"
              class="min-h-12 justify-center"
              :loading="resolving"
              data-test="sumup-went-through"
              @click="resolveAttempt(sumup.pending.value.id, 'succeeded')"
            >
              It went through
            </UButton>
            <UButton
              color="neutral"
              variant="subtle"
              class="min-h-12 justify-center"
              :loading="resolving"
              data-test="sumup-did-not"
              @click="resolveAttempt(sumup.pending.value.id, 'abandoned', abandonNote.trim() || null)"
            >
              It did not
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              class="min-h-12 justify-center"
              icon="i-lucide-refresh-cw"
              data-test="sumup-check-again"
              @click="checkAttempt"
            >
              Check again
            </UButton>
          </div>
          <p class="mt-2 text-xs text-muted">
            Nothing happened? The SumUp app is not on this device: say it did not, and key the figure into the reader.
          </p>
        </NightBlock>

        <!-- Tonight's other hand-offs still waiting, so the laptop can answer for a phone (criterion 6). -->
        <NightBlock
          v-if="openAttempts.length && !charged"
          title="Unanswered SumUp payments"
          data-test="sumup-open-attempts"
        >
          <div
            v-for="attempt in openAttempts"
            :key="attempt.id"
            class="border-b border-default py-2 last:border-b-0"
            :data-test="`sumup-open-${attempt.id}`"
          >
            <p class="text-sm">
              <span class="font-semibold">{{ saysMoney(attempt.expectedTotalPence) }}</span>
              · {{ timeOf(attempt.createdAt) }}<span v-if="attempt.createdByName"> · {{ attempt.createdByName }}</span>
              · {{ saysAttemptStatus(attempt.status) }}
            </p>
            <p
              v-if="attempt.error"
              class="text-xs text-muted"
            >
              {{ attempt.error }}
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                size="sm"
                class="min-h-10"
                :loading="resolving"
                :data-test="`sumup-open-succeeded-${attempt.id}`"
                @click="resolveAttempt(attempt.id, 'succeeded')"
              >
                It went through
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="subtle"
                class="min-h-10"
                :loading="resolving"
                :data-test="`sumup-open-abandoned-${attempt.id}`"
                @click="resolveAttempt(attempt.id, 'abandoned', attempt.status === 'MISMATCH' ? (abandonNote.trim() || null) : null)"
              >
                It did not
              </UButton>
            </div>
          </div>
        </NightBlock>

        <template v-if="!charged">
          <!-- Two panes over one basket (F-122 criterion 1). -->
          <div
            class="grid grid-cols-2 gap-2"
            role="tablist"
            data-test="till-panes"
          >
            <UButton
              role="tab"
              :aria-selected="pane === 'bar'"
              :color="pane === 'bar' ? 'primary' : 'neutral'"
              :variant="pane === 'bar' ? 'solid' : 'subtle'"
              class="min-h-12 justify-center"
              data-test="pane-bar"
              @click="pane = 'bar'"
            >
              Bar
            </UButton>
            <UButton
              role="tab"
              :aria-selected="pane === 'tickets'"
              :color="pane === 'tickets' ? 'primary' : 'neutral'"
              :variant="pane === 'tickets' ? 'solid' : 'subtle'"
              class="min-h-12 justify-center"
              data-test="pane-tickets"
              @click="pane = 'tickets'"
            >
              Tickets
            </UButton>
          </div>

          <div
            v-if="pane === 'tickets'"
            class="space-y-4"
            data-test="tickets-pane"
          >
            <NightBlock title="Find a booking">
              <div class="flex flex-wrap gap-2">
                <UInput
                  v-model="lookupTerm"
                  placeholder="Reference or name"
                  autocapitalize="characters"
                  class="min-w-0 grow"
                  data-test="ticket-lookup"
                  @keyup.enter="lookUp"
                />
                <UButton
                  class="min-h-12"
                  :loading="lookingUp"
                  data-test="ticket-lookup-submit"
                  @click="lookUp"
                >
                  Find
                </UButton>
                <UButton
                  v-if="cameraOpen"
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-camera-off"
                  class="min-h-12"
                  data-test="ticket-scan-close"
                  @click="cameraOpen = false"
                >
                  Close the camera
                </UButton>
                <UButton
                  v-else
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-camera"
                  class="min-h-12"
                  data-test="ticket-scan-camera"
                  @click="openCamera"
                >
                  Scan
                </UButton>
              </div>
              <p
                v-if="cameraNote"
                class="mt-2 text-sm text-muted"
                data-test="ticket-scan-camera-note"
              >
                {{ cameraNote }}
              </p>
              <QrScanner
                v-if="cameraOpen"
                class="mt-3 w-full"
                @decoded="scanDecoded"
                @unavailable="fallBackToTyping"
              />
              <UAlert
                v-if="lookupFailure"
                class="mt-3"
                color="warning"
                variant="subtle"
                :description="lookupFailure"
                data-test="ticket-lookup-failure"
              />
              <div
                v-for="booking in found"
                :key="booking.id"
                class="mt-3 rounded-lg border border-default p-3"
                :data-test="`found-${booking.id}`"
              >
                <p class="font-mono text-sm tracking-widest">
                  {{ booking.reference }}
                </p>
                <p class="text-sm">
                  {{ booking.bookerFirstName ?? 'Walk-up' }} · party of {{ booking.partySize }} · {{ booking.showTitle }}
                </p>
                <p
                  class="text-sm"
                  :class="booking.isTonight ? 'text-muted' : 'text-warning'"
                >
                  {{ formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'medium', timeStyle: 'short' }) }}
                  <template v-if="!booking.isTonight">
                    · not tonight
                  </template>
                </p>
                <p
                  v-if="booking.refusal"
                  class="mt-2 text-sm text-muted"
                  :data-test="`found-refusal-${booking.id}`"
                >
                  {{ booking.refusal }}
                </p>
                <UButton
                  v-else
                  class="mt-2 min-h-12"
                  :disabled="ticketLines.some(line => line.id === booking.id)"
                  :data-test="`found-add-${booking.id}`"
                  @click="addBooking(booking)"
                >
                  Add {{ saysMoney(booking.owedPence) }} to the basket
                </UButton>
              </div>
            </NightBlock>

            <NightBlock title="Walk-up">
              <USelect
                v-if="tonightsPerformances.length > 1"
                v-model="walkUpPerformanceId"
                :items="tonightsPerformances.map(one => ({ label: `${one.showTitle} · ${formatLondon(new Date(one.startsAt * 1000), { timeStyle: 'short' })}`, value: one.id }))"
                placeholder="Which performance"
                class="w-full"
                data-test="walk-up-performance"
              />
              <UAlert
                v-if="walkUpOptionsFailure"
                class="mt-2"
                color="warning"
                variant="subtle"
                :description="walkUpOptionsFailure"
              />
              <div
                v-for="option in walkUpOptions"
                :key="option.id"
                class="mt-2 flex items-center justify-between gap-2"
                :data-test="`walk-up-option-${option.id}`"
              >
                <span class="text-sm">{{ option.name }} · {{ saysMoney(option.price) }}</span>
                <div class="flex items-center gap-1">
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-minus"
                    class="size-12"
                    :aria-label="`One fewer ${option.name}`"
                    :data-test="`walk-up-minus-${option.id}`"
                    @click="bumpWalkUp(option.id, -1)"
                  />
                  <span
                    class="w-6 text-center text-sm"
                    :data-test="`walk-up-qty-${option.id}`"
                  >{{ walkUpQty[option.id] ?? 0 }}</span>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-plus"
                    class="size-12"
                    :aria-label="`One more ${option.name}`"
                    :data-test="`walk-up-plus-${option.id}`"
                    @click="bumpWalkUp(option.id, 1)"
                  />
                </div>
              </div>
              <p
                v-if="walkUpPerformanceId && walkUpOptions.length === 0 && !walkUpOptionsFailure"
                class="mt-2 text-sm text-muted"
              >
                Nothing is on sale for this performance.
              </p>
              <UButton
                v-if="walkUpOptions.length"
                class="mt-3 min-h-12"
                color="neutral"
                variant="subtle"
                :disabled="!Object.values(walkUpQty).some(qty => qty > 0)"
                data-test="walk-up-add"
                @click="addWalkUps"
              >
                Add to the basket
              </UButton>
              <p class="mt-4 text-xs text-muted">
                Their name and email are optional. With them, the booking's QR is emailed; without, the pass on screen is theirs to photograph.
              </p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <UInput
                  v-model="walkUpGuestName"
                  placeholder="Name"
                  data-test="walk-up-name"
                />
                <UInput
                  v-model="walkUpGuestEmail"
                  type="email"
                  autocapitalize="off"
                  placeholder="Email"
                  data-test="walk-up-email"
                />
              </div>
              <p
                v-if="walkUpGuestIncomplete"
                class="mt-1 text-xs text-warning"
                data-test="walk-up-guest-incomplete"
              >
                Both a name and an email, or neither.
              </p>
            </NightBlock>
          </div>

          <div
            v-for="category in categories"
            v-show="pane === 'bar'"
            :key="category.id"
          >
            <template v-if="productsIn(category.id).length">
              <h2 class="mb-2 text-sm font-semibold text-muted">
                {{ category.name }}
              </h2>
              <div class="mb-4 space-y-2">
                <div
                  v-for="product in productsIn(category.id)"
                  :key="product.id"
                  class="rounded-lg border border-default p-2"
                  :data-test="`product-${product.id}`"
                >
                  <div class="flex items-start justify-between gap-1">
                    <span class="text-sm font-medium">{{ product.name }}</span>
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-info"
                      class="min-h-12 min-w-12"
                      :aria-label="`Allergens for ${product.name}`"
                      :data-test="`allergen-${product.id}`"
                      @click="allergenOpen = { name: product.name, state: product.allergenState, note: product.allergenNote }"
                    />
                  </div>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <UButton
                      v-for="variant in product.variants"
                      :key="variant.id"
                      color="neutral"
                      variant="subtle"
                      class="min-h-12 min-w-12"
                      :data-test="`variant-${variant.id}`"
                      @click="tapVariant(product.name, variant)"
                    >
                      {{ variant.label }} · {{ saysMoney(variant.pricePence) }}
                    </UButton>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <div
            v-if="!basketEmpty"
            class="space-y-3 border-t border-default pt-4"
            data-test="basket"
          >
            <h2 class="text-sm font-semibold text-muted">
              Basket
            </h2>
            <!-- Ticket money beside the drinks, one basket (F-122 criterion 3). -->
            <div
              v-for="line in ticketLines"
              :key="line.id"
              class="flex items-center justify-between gap-2"
              :data-test="`ticket-line-${line.id}`"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-secondary">
                  Booking {{ line.reference }}<span v-if="line.bookerFirstName">, {{ line.bookerFirstName }}</span>
                </p>
                <p class="text-xs text-muted">
                  {{ line.showTitle }} · {{ saysMoney(line.owedPence) }}
                </p>
              </div>
              <UButton
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-x"
                class="size-12"
                :aria-label="`Remove booking ${line.reference}`"
                :data-test="`ticket-line-remove-${line.id}`"
                @click="removeBooking(line.id)"
              />
            </div>
            <div
              v-for="line in walkUpLines"
              :key="`${line.performanceId}:${line.ticketTypeId}`"
              class="flex items-center justify-between gap-2"
              :data-test="`walk-up-line-${line.ticketTypeId}`"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-secondary">
                  Walk-up · {{ line.quantity }} × {{ line.typeName }}
                </p>
                <p class="text-xs text-muted">
                  {{ line.showTitle }} · {{ saysMoney(line.unitPrice * line.quantity) }}
                </p>
              </div>
              <UButton
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-x"
                class="size-12"
                :aria-label="`Remove the ${line.typeName} walk-up`"
                :data-test="`walk-up-line-remove-${line.ticketTypeId}`"
                @click="removeWalkUp(line)"
              />
            </div>
            <div
              v-for="line in basket"
              :key="line.id"
              class="flex items-center justify-between gap-2"
              :data-test="`line-${line.id}`"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ line.productName }}, {{ line.variantLabel }}<span v-if="line.choiceItemName">, {{ line.choiceItemName }}</span>
                </p>
                <p
                  class="text-xs text-muted"
                  :data-test="`line-amount-${line.id}`"
                >
                  {{ lineAmount(line) ?? 'Pricing…' }}
                </p>
              </div>
              <div class="flex items-center gap-1">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-minus"
                  class="size-12"
                  :aria-label="`One fewer ${line.variantLabel}`"
                  :data-test="`line-minus-${line.id}`"
                  @click="decrementLine(line)"
                />
                <span
                  class="w-6 text-center text-sm"
                  :data-test="`line-qty-${line.id}`"
                >{{ line.qty }}</span>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-plus"
                  class="size-12"
                  :aria-label="`One more ${line.variantLabel}`"
                  :data-test="`line-plus-${line.id}`"
                  @click="incrementLine(line)"
                />
                <UButton
                  size="sm"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-x"
                  class="size-12"
                  :aria-label="`Remove ${line.variantLabel}`"
                  :data-test="`line-remove-${line.id}`"
                  @click="removeLine(line)"
                />
              </div>
            </div>

            <div
              v-if="discounts.data.value?.discounts.length"
              class="space-y-2"
              data-test="discount-picker"
            >
              <p class="text-xs text-muted">
                Discount
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  :color="selectedDiscountId === null ? 'primary' : 'neutral'"
                  :variant="selectedDiscountId === null ? 'solid' : 'subtle'"
                  class="min-h-10"
                  data-test="discount-none"
                  @click="selectedDiscountId = null"
                >
                  None
                </UButton>
                <UButton
                  v-for="discount in discounts.data.value.discounts"
                  :key="discount.id"
                  size="sm"
                  :color="selectedDiscountId === discount.id ? 'primary' : 'neutral'"
                  :variant="selectedDiscountId === discount.id ? 'solid' : 'subtle'"
                  class="min-h-10"
                  :data-test="`discount-${discount.id}`"
                  @click="selectedDiscountId = discount.id"
                >
                  {{ discount.name }} (-{{ discount.percent }}%)
                </UButton>
              </div>
            </div>

            <div
              v-if="tabHolders.data.value?.holders.length && !hasTicketMoney"
              class="space-y-2"
              data-test="tab-holder-picker"
            >
              <p class="text-xs text-muted">
                Charge to
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  :color="selectedTabHolderId === null ? 'primary' : 'neutral'"
                  :variant="selectedTabHolderId === null ? 'solid' : 'subtle'"
                  class="min-h-10"
                  data-test="tab-holder-none"
                  @click="selectedTabHolderId = null"
                >
                  The reader
                </UButton>
                <UButton
                  v-for="holder in tabHolders.data.value.holders"
                  :key="holder.id"
                  size="sm"
                  :color="selectedTabHolderId === holder.id ? 'primary' : 'neutral'"
                  :variant="selectedTabHolderId === holder.id ? 'solid' : 'subtle'"
                  class="min-h-10"
                  :data-test="`tab-holder-${holder.id}`"
                  @click="selectedTabHolderId = holder.id"
                >
                  {{ holder.name }}'s tab
                </UButton>
              </div>
            </div>

            <UAlert
              v-if="chargeFailure"
              data-test="charge-failure"
              color="error"
              variant="subtle"
              :description="chargeFailure"
            />
            <UAlert
              v-if="priceFailure"
              data-test="price-failure"
              color="error"
              variant="subtle"
              :description="priceFailure"
            />
            <template v-else>
              <p
                v-if="priced?.discount"
                class="flex items-center justify-between text-xs text-muted"
                data-test="basket-discount"
              >
                <span>{{ priced.discount.name }} (-{{ priced.discount.percent }}%)</span>
                <span>-{{ saysMoney(priced.lines.reduce((sum, line) => sum + line.discountPence, 0)) }}</span>
              </p>
              <p
                class="flex items-center justify-between text-base font-semibold"
                data-test="basket-total"
              >
                <span>Total</span>
                <span data-test="basket-total-amount">{{ grandTotalPence !== null && !pricing ? saysMoney(grandTotalPence) : 'Pricing…' }}</span>
              </p>
              <p
                v-if="hasTicketMoney && basket.length"
                class="text-xs text-muted"
                data-test="basket-split"
              >
                Bar {{ priced && !pricing ? saysMoney(priced.totalPence) : '…' }} · tickets {{ saysMoney(ticketsPence + walkUpsPence) }}, in one reader transaction
              </p>
            </template>
          </div>
        </template>

        <div
          v-else
          class="space-y-4"
          data-test="charge-confirmation"
        >
          <UAlert
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            :title="charged?.tab ? `On ${charged.tab.holderName}'s tab` : charged?.viaSumup ? 'Taken on SumUp' : 'Key this into the reader'"
            :description="charged ? saysMoney(charged.totalPence) : ''"
          />
          <UAlert
            v-if="charged && charged.tickets.length"
            data-test="tickets-collected-note"
            color="info"
            variant="subtle"
            :description="`Collected: ${charged.tickets.map(ticket => ticket.reference).join(', ')}. The door now reads PAID.`"
          />
          <!-- The door pass (F-123 criterion 4): photographed off the screen, or printed. -->
          <div
            v-for="pass in charged?.walkUps ?? []"
            :key="pass.reservationId"
            class="print-pass rounded-xl border border-default bg-white p-4 text-center text-black"
            :data-test="`door-pass-${pass.reservationId}`"
          >
            <p class="font-mono text-2xl tracking-[0.3em]">
              {{ pass.reference }}
            </p>
            <p class="text-sm">
              {{ pass.showTitle }} · party of {{ pass.partySize }} · paid
            </p>
            <img
              :src="`data:image/svg+xml;base64,${pass.qrSvg}`"
              alt="Booking QR code"
              width="180"
              height="180"
              class="mx-auto my-2"
            >
            <p class="text-xs">
              Show this at the door, or read out the reference.
            </p>
          </div>
          <UButton
            v-if="charged?.walkUps.length"
            block
            color="neutral"
            variant="subtle"
            class="min-h-12 print:hidden"
            icon="i-lucide-printer"
            data-test="door-pass-print"
            @click="printPass"
          >
            Print the door pass
          </UButton>
          <UAlert
            v-if="charged && charged.refusedLines.length"
            data-test="age-check-refused-note"
            color="warning"
            variant="subtle"
            :description="`Not sold, on the ID refusal: ${charged.refusedLines.map(line => line.productName).join(', ')}`"
          />
          <UAlert
            v-if="charged && charged.discount"
            data-test="discount-applied-note"
            color="info"
            variant="subtle"
            :description="`${charged.discount.name} applied: -${charged.discount.percent}%`"
          />
          <UAlert
            v-if="charged?.tab"
            data-test="tab-balance-note"
            color="info"
            variant="subtle"
            :description="`${charged.tab.holderName}'s tab now stands at ${saysMoney(charged.tab.outstandingPence)}${charged.tab.capOverridden ? ', over the cap, approved by a manager' : ''}`"
          />
          <UButton
            block
            size="xl"
            class="min-h-12"
            data-test="next-sale"
            @click="nextSale"
          >
            Start the next sale
          </UButton>
        </div>
      </div>

      <p
        v-else
        data-test="till-closed"
      >
        The till is not open yet.
      </p>

      <template #actions>
        <NightAction
          v-if="session && !charged && !basketEmpty && grandTotalPence !== null && sumupAvailable && !sumup.pending.value"
          :label="`Charge ${saysMoney(grandTotalPence)} on SumUp`"
          icon="i-lucide-smartphone-nfc"
          :disabled="pricing || walkUpGuestIncomplete"
          :loading="charging"
          data-test="charge-sumup"
          @press="() => chargeOnSumUp()"
        />
        <NightAction
          v-if="session && !charged && !basketEmpty && grandTotalPence !== null && !sumup.pending.value"
          :label="selectedTabHolderId ? `Put ${saysMoney(grandTotalPence)} on the tab` : sumupAvailable ? `Key ${saysMoney(grandTotalPence)} into the reader` : `Charge ${saysMoney(grandTotalPence)}`"
          :icon="selectedTabHolderId ? 'i-lucide-book-user' : 'i-lucide-credit-card'"
          :color="sumupAvailable ? 'neutral' : 'primary'"
          :disabled="pricing || walkUpGuestIncomplete"
          :loading="charging"
          data-test="charge-reader"
          @press="() => charge()"
        />
        <NightAction
          v-if="session"
          label="Close till"
          icon="i-lucide-lock"
          color="error"
          data-test="open-close-till"
          @press="openCloseModal"
        />
        <NightAction
          v-else
          label="Open till"
          icon="i-lucide-lock-open"
          :loading="busy"
          @press="open"
        />
      </template>
    </NightScreen>

    <UModal
      :open="choosing !== null"
      :title="choosing ? choosing.choice.name : ''"
      description="Pick one; it depletes at no extra charge."
      @update:open="choosing = null"
    >
      <template #body>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            v-for="option in choosing?.choice.options ?? []"
            :key="option.id"
            color="neutral"
            variant="subtle"
            class="min-h-12"
            :data-test="`choice-option-${option.id}`"
            @click="chooseOption(option.id, option.itemName)"
          >
            {{ option.itemName }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="allergenOpen !== null"
      :title="allergenOpen ? `Allergens: ${allergenOpen.name}` : ''"
      @update:open="allergenOpen = null"
    >
      <template #body>
        <p
          data-test="allergen-state"
          class="font-medium"
        >
          {{ says(allergenOpen?.state ?? '') }}
        </p>
        <p
          v-if="allergenOpen?.note"
          data-test="allergen-note"
          class="mt-2 text-sm"
        >
          {{ allergenOpen.note }}
        </p>
      </template>
    </UModal>

    <UModal
      :open="ageCheckStep !== 'closed'"
      title="Challenge 25"
      description="This basket has an age-restricted line."
      @update:open="resetAgeCheck"
    >
      <template #body>
        <div
          v-if="ageCheckStep === 'choose'"
          class="space-y-3"
        >
          <p class="text-sm text-muted">
            What ID was shown?
          </p>
          <div class="grid grid-cols-2 gap-2">
            <UButton
              v-for="idType in ID_TYPES"
              :key="idType"
              color="neutral"
              variant="subtle"
              class="min-h-12"
              :loading="charging"
              :data-test="`age-check-id-${idType}`"
              @click="acceptAgeCheck(idType)"
            >
              {{ saysIdType(idType) }}
            </UButton>
          </div>
          <UButton
            block
            color="error"
            variant="subtle"
            class="min-h-12"
            data-test="age-check-refuse"
            @click="ageCheckStep = 'refuse'"
          >
            Refused
          </UButton>
        </div>

        <div
          v-else
          class="space-y-3"
        >
          <p class="text-sm text-muted">
            Why was it refused?
          </p>
          <div class="grid grid-cols-2 gap-2">
            <UButton
              v-for="reason in REFUSAL_REASONS"
              :key="reason"
              color="neutral"
              :variant="ageCheckReason === reason ? 'solid' : 'subtle'"
              class="min-h-12"
              :data-test="`age-check-reason-${reason}`"
              @click="ageCheckReason = reason"
            >
              {{ saysRefusalReason(reason) }}
            </UButton>
          </div>
          <UTextarea
            v-model="ageCheckDescription"
            placeholder="Describe who you checked, never by name"
            data-test="age-check-description"
          />
          <UAlert
            v-if="ageCheckError"
            data-test="age-check-error"
            color="error"
            variant="subtle"
            :description="ageCheckError"
          />
          <UButton
            block
            color="error"
            class="min-h-12"
            :loading="charging"
            data-test="age-check-confirm-refuse"
            @click="refuseAgeCheck"
          >
            Confirm refusal
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="closeModalOpen"
      title="Close till"
      description="What the ledger expects, and what the reader actually shows."
      @update:open="closeModalOpen = $event"
    >
      <template #body>
        <div
          v-if="reconciliationLoading"
          data-test="reconciliation-loading"
          class="py-6 text-center text-sm text-muted"
        >
          Working it out&hellip;
        </div>
        <UAlert
          v-else-if="reconciliationFailure"
          data-test="reconciliation-failure"
          color="error"
          variant="subtle"
          :description="reconciliationFailure"
        />
        <div
          v-else-if="reconciliation"
          class="space-y-4"
        >
          <dl
            data-test="reconciliation-breakdown"
            class="space-y-1 text-sm"
          >
            <div class="flex justify-between">
              <dt>Card sales</dt>
              <dd>{{ saysMoney(reconciliation.bar.cardSalesPence) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt>Tab settlements</dt>
              <dd>{{ saysMoney(reconciliation.bar.tabSettlementsPence) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt>Comps ({{ reconciliation.bar.compsCount }})</dt>
              <dd>{{ saysMoney(reconciliation.bar.compsForegonePence) }} foregone</dd>
            </div>
            <div class="flex justify-between">
              <dt>Discounts given</dt>
              <dd>{{ saysMoney(reconciliation.bar.discountsPence) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt>Refunds</dt>
              <dd>{{ saysMoney(reconciliation.bar.refundsPence) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt>Tab charges (credit extended)</dt>
              <dd>{{ saysMoney(reconciliation.bar.tabChargesPence) }}</dd>
            </div>
            <div class="flex justify-between font-medium">
              <dt>Expected on the reader, this bar</dt>
              <dd data-test="expected-pence">
                {{ saysMoney(reconciliation.bar.expectedPence) }}
              </dd>
            </div>
            <div class="flex justify-between text-muted">
              <dt>Desk takings, alongside</dt>
              <dd>{{ saysMoney(reconciliation.deskTakingsPence) }}</dd>
            </div>
          </dl>

          <UInputNumber
            v-model="actualZPounds"
            :min="0"
            :step="0.5"
            :format-options="{ style: 'currency', currency: 'GBP' }"
            data-test="actual-z-input"
          />

          <UAlert
            v-if="variancePreviewPence !== 0"
            data-test="variance-preview"
            color="warning"
            variant="subtle"
            :description="`${saysMoney(Math.abs(variancePreviewPence))} ${variancePreviewPence > 0 ? 'over' : 'under'} what the ledger expects. A note is needed before this can be recorded.`"
          />

          <UTextarea
            v-if="variancePreviewPence !== 0"
            v-model="varianceNote"
            placeholder="Why does the reader disagree with the ledger?"
            data-test="variance-note"
          />

          <UAlert
            v-if="closeFailure"
            data-test="close-failure"
            color="error"
            variant="subtle"
            :description="closeFailure"
          />

          <UButton
            block
            color="error"
            class="min-h-12"
            :loading="closingBusy"
            data-test="confirm-close-till"
            @click="confirmClose"
          >
            Confirm close
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
