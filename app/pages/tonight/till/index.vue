<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysChargeOnReader, saysChargeOnSumUp } from '#shared/utils/till'
import { saysClock } from '#shared/utils/when'
import type { InlineAgeCheckInput } from '#shared/utils/age-checks'
import type { CompRequest } from '#shared/utils/comps'
import type { PricedBasket, SaleProduct, SaleReceipt } from '#shared/utils/sale'
import type { ChargedReceipt } from '~/composables/useSumUpCharge'
import type { AgeCheckStep } from '~/components/till/Challenge25Modal.vue'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/till' })
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
  venues,
  venuesFailure,
  needsVenue,
  chooseVenue,
  open,
  closeModalOpen,
  reconciliation,
  reconciliationLoading,
  reconciliationFailure,
  refreshing,
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

// The device's own answer, not a probe: pricing is a round trip, so what the till can say about
// a dropped connection is what it can charge on (K-103, issue 1150 item 7).
const online = useOnline()

// Two panes over one basket (F-122), the tab list below the basket: neither pane is unmounted,
// so the tickets scanner survives a switch (issue 1150 item 8).
const pane = ref<'bar' | 'tickets'>('bar')
const PANE_TABS: { value: 'bar' | 'tickets', label: string }[] = [{ value: 'bar', label: 'Bar' }, { value: 'tickets', label: 'Tickets' }]

const {
  cameraOpen,
  cameraNote,
  lookupTerm,
  lookingUp,
  lookupFailure,
  found,
  openCamera,
  fallBackToTyping,
  lookUp,
  scanDecoded,
  ticketLines,
  ticketsPence,
  addBooking,
  removeBooking,
  walkUpPerformanceId,
  walkUpOptions,
  walkUpOptionsFailure,
  walkUpQty,
  walkUpGuestName,
  walkUpGuestEmail,
  walkUpLines,
  walkUpsPence,
  tonightsPerformances,
  bumpWalkUp,
  addWalkUps,
  removeWalkUp,
  walkUpGuest,
  walkUpGuestIncomplete,
  resetTickets,
} = useTillTickets(venueId)

const {
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
  resetSelections,
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
  recordAgeCheck: body => $fetch('/api/tonight/age-checks', { method: 'POST', body }),
  online,
})

// A collapsed reminder above the pinned actions, so checking the basket does not mean scrolling
// past the whole grid first (K-102 criterion 3).
const basketItemCount = computed(() => basket.value.reduce((sum, line) => sum + line.qty, 0)
  + ticketLines.value.length
  + walkUpLines.value.reduce((sum, line) => sum + line.quantity, 0))

const charging = ref(false)
const chargeFailure = ref<string | null>(null)
const charged = ref<ChargedReceipt | null>(null)

const ageCheckStep = ref<AgeCheckStep>('closed')

function readyToCharge(): boolean {
  if (!venueId.value || basketEmpty.value || walkUpGuestIncomplete.value) return false
  return basket.value.length === 0 || priced.value !== null
}

const {
  sumup,
  sumupAvailable,
  waiting,
  waitingFailure,
  resolving,
  smpTxCodeTyped,
  abandonNote,
  openAttempts,
  startWatching,
  checkAttempt,
  resolveAttempt,
} = useSumUpCharge({
  request: (path, options) => $fetch(path, options),
  venueId,
  sumupEnabled,
  selectedTabHolderId,
  session,
  basket,
  ticketLines,
  walkUpLines,
  selectedDiscountId,
  charged,
  chargeFailure,
  resetSelections,
})

// Which path the Challenge 25 prompt was opened for, so its answer goes the same way. A tap
// answers nothing but the check itself: the sale is still being built (F-106 criterion 6).
const chargeVia = ref<'tap' | 'reader' | 'sumup' | 'comp'>('reader')

watch(askingAgeCheckFor, (product) => {
  if (!product) return
  chargeVia.value = 'tap'
  ageCheckStep.value = 'choose'
})

// Dismissed rather than answered: the restricted line is still in the basket with no outcome,
// and the charge button asks again.
watch(ageCheckStep, (step) => {
  if (step === 'closed') askingAgeCheckFor.value = null
})

// A comp is bar lines only, at whatever it is, never on a tab, and never asked twice over a
// SumUp hand-off already in flight for the same basket (F-110 criteria 1, 4).
const compEligible = computed(() => !hasTicketMoney.value && !selectedTabHolderId.value && !selectedDiscountId.value && basket.value.length > 0 && priced.value !== null && !sumup.pending.value)

const {
  open: compOpen,
  reason: compReason,
  sending: compSending,
  sendFailure: compSendFailure,
  requestId: compRequestId,
  request: compRequest,
  sentPriced: compSentPriced,
  needsAgeCheck: compNeedsAgeCheck,
  canGive: compCanGive,
  declined: compDeclined,
  lapsed: compLapsed,
  locked: compLocked,
  pollFailure: compPollFailure,
  givingBusy: compGivingBusy,
  giveFailure: compGiveFailure,
  given: compGiven,
  openModal: openCompModal,
  reset: resetComp,
  send: sendCompRequest,
  give: giveCompRequest,
} = useTillComp({
  venueId,
  isVariantRestricted,
  requestComp: body => $fetch<{ id: string, priced: PricedBasket }>('/api/till/comp-requests', { method: 'POST', body }),
  pollRequest: id => $fetch<{ request: CompRequest }>(`/api/till/comp-requests/${id}`),
  giveComp: (id, body) => $fetch<SaleReceipt>(`/api/till/comp-requests/${id}/sale`, { method: 'POST', body }),
})

// The frozen total once a request exists, the same figure the server holds; the live basket
// total only while there is nothing to freeze yet.
const compTotalPence = computed(() => compSentPriced.value?.totalPence ?? grandTotalPence.value ?? 0)

function sendComp(): void {
  void sendCompRequest(basket.value.map(line => ({ variantId: line.variantId, qty: line.qty, choiceItemId: line.choiceItemId })))
}

function giveComp(ageCheck: InlineAgeCheckInput | null = passedAgeCheck.value): void {
  if (!ageCheck && compNeedsAgeCheck.value) {
    chargeVia.value = 'comp'
    ageCheckStep.value = 'choose'
    return
  }
  ageCheckStep.value = 'closed'
  void giveCompRequest(ageCheck)
}

function nextSaleFromComp(): void {
  resetComp()
  nextSale()
}

// Declined or lapsed frees the basket on its own (useTillComp's `locked`); dismissing just
// clears the request so the chip and a fresh ask are available again.
function dismissComp(): void {
  resetComp()
}

// The submission step (F-104, F-105, 0004). A restricted line with no outcome yet opens the
// Challenge 25 prompt (F-106); a tab holder chosen below charges credit, not the reader (F-108).
async function charge(ageCheck: InlineAgeCheckInput | null = passedAgeCheck.value): Promise<void> {
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
    ageCheckStep.value = 'closed'
  }
  catch (refused) {
    // K-103 protects reads, not writes: a transport failure needs different words from an
    // ordinary refusal, since whether the sale landed is unknown rather than settled (finding 16).
    chargeFailure.value = writeFailureText(refused, 'Check the reader: ring it up again only if it took nothing.')
    ageCheckStep.value = 'closed'
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
async function chargeOnSumUp(ageCheck: InlineAgeCheckInput | null = passedAgeCheck.value): Promise<void> {
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
    ageCheckStep.value = 'closed'
    startWatching()
    sumup.launch(started.launchUrl)
  }
  catch (refused) {
    // This only starts a hand-off, not a sale, so the ambiguity is whether that start landed.
    chargeFailure.value = writeFailureText(refused, 'Check the open SumUp hand-offs before trying again.')
    ageCheckStep.value = 'closed'
    await recomputeTotal()
  }
  finally {
    charging.value = false
  }
}

function timeOf(at: number): string {
  return saysClock(at)
}

// Whichever the modal answers with, the same submission the reader, SumUp or comp path already
// had. An answer to a tap settles the check for this sale and nothing else.
function submitAgeCheck(outcome: InlineAgeCheckInput): void {
  if (outcome.outcome !== 'REFUSED') acceptAgeCheck(outcome)
  if (chargeVia.value === 'tap') {
    if (outcome.outcome === 'REFUSED') void refuseAgeCheck(outcome)
    ageCheckStep.value = 'closed'
    return
  }
  if (chargeVia.value === 'comp') giveComp(outcome)
  else void (chargeVia.value === 'sumup' ? chargeOnSumUp(outcome) : charge(outcome))
}

function nextSale(): void {
  resetBasket()
  resetTickets()
  resetSelections()
  charged.value = null
  chargeFailure.value = null
  pane.value = 'bar'
  ageCheckStep.value = 'closed'
}

// What the charge buttons read while the total is unknown, so they can stay on screen and say
// why rather than disappearing (issue 1150 item 7).
const readerLabel = computed(() => saysChargeOnReader(grandTotalPence.value, Boolean(selectedTabHolderId.value)))
const sumupLabel = computed(() => saysChargeOnSumUp(grandTotalPence.value))

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
        ? (basketEmpty ? 'Tap a size to add it. Quantities and lines are editable before payment.' : undefined)
        : 'One till for the whole night. Everyone at this bar sells against it.'"
      :stale="session ? catalogue.cachedAt.value : syncedAt"
      :busy="busy || catalogue.pending.value"
    >
      <!-- The guard refuses a request naming no venue, and the answer to that is a tap rather
           than a refusal a volunteer has to decode (F-125, 0077). -->
      <div
        v-if="needsVenue"
        data-test="till-venue-picker"
        class="space-y-3"
      >
        <p class="text-sm text-muted">
          Which bar are you opening tonight?
        </p>
        <UAlert
          v-if="venuesFailure"
          data-test="till-venues-failure"
          color="error"
          variant="subtle"
          :description="venuesFailure"
        />
        <UButton
          v-for="venue in venues"
          :key="venue.venueId"
          :data-test="`till-venue-${venue.venueId}`"
          color="neutral"
          variant="subtle"
          size="xl"
          block
          class="min-h-12 justify-between"
          @click="chooseVenue(venue.venueId)"
        >
          <span>{{ venue.venueName }}</span>
          <span class="text-xs text-muted">{{ venue.what }}</span>
        </UButton>
      </div>

      <UAlert
        v-else-if="failure"
        data-test="till-failure"
        color="error"
        variant="subtle"
        :description="failure.message"
        :actions="failure.enrolPath ? [{ label: 'Set up an authenticator app', to: failure.enrolPath, color: 'error' }] : []"
      />

      <div
        v-else-if="session"
        class="space-y-6"
      >
        <div class="flex items-center justify-between gap-2">
          <p
            data-test="till-open"
            class="text-xs text-muted"
          >
            Open since {{ saysClock(session.openedAt) }}.
          </p>
          <!-- Not a per-sale action, so it lives here rather than under the thumb (K-102
               criterion 2). -->
          <UDropdownMenu
            :items="[[{ label: 'Close till', icon: 'i-lucide-lock', onSelect: openCloseModal }]]"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="sm"
              class="size-12"
              aria-label="More till actions"
              data-test="till-overflow-menu"
            />
          </UDropdownMenu>
        </div>

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

        <UAlert
          v-if="refusedLinesNote"
          data-test="age-check-not-sold"
          color="warning"
          variant="subtle"
          icon="i-lucide-id-card"
          :description="refusedLinesNote"
        />

        <UAlert
          v-if="refusalRecordFailure"
          data-test="age-check-record-failure"
          color="error"
          variant="subtle"
          :description="refusalRecordFailure"
        />

        <TillSumUpWaiting
          v-if="!charged"
          v-model:smp-tx-code-typed="smpTxCodeTyped"
          v-model:abandon-note="abandonNote"
          :pending="sumup.pending.value"
          :waiting="waiting"
          :waiting-failure="waitingFailure"
          :resolving="resolving"
          :open-attempts="openAttempts"
          :time-of="timeOf"
          @check-again="checkAttempt"
          @resolve="resolveAttempt"
        />

        <template v-if="!charged">
          <div
            :inert="compLocked || sumup.pending.value !== null"
            :class="{ 'opacity-50': compLocked || sumup.pending.value !== null }"
            class="space-y-6"
          >
            <!-- The tabs are hand-rolled rather than UTabs, because the panes need ids that name
                 their own tab and neither pane may be torn down (K-101, issue 1150 item 8). -->
            <div
              class="grid grid-cols-2 gap-1 rounded-lg bg-elevated p-1"
              role="tablist"
              aria-label="What is being sold"
              data-test="till-panes"
              @keydown.left="pane = 'bar'"
              @keydown.right="pane = 'tickets'"
            >
              <button
                v-for="tab in PANE_TABS"
                :id="`till-pane-${tab.value}`"
                :key="tab.value"
                type="button"
                role="tab"
                :aria-selected="pane === tab.value"
                :aria-controls="`pane-${tab.value}-panel`"
                :tabindex="pane === tab.value ? 0 : -1"
                class="min-h-12 rounded-md text-sm font-medium"
                :class="pane === tab.value ? 'bg-default text-highlighted' : 'text-muted'"
                :data-test="`till-pane-${tab.value}`"
                @click="pane = tab.value"
              >
                {{ tab.label }}
              </button>
            </div>

            <TillTicketsPane
              v-show="pane === 'tickets'"
              id="pane-tickets-panel"
              v-model:lookup-term="lookupTerm"
              v-model:camera-open="cameraOpen"
              v-model:walk-up-performance-id="walkUpPerformanceId"
              v-model:walk-up-guest-name="walkUpGuestName"
              v-model:walk-up-guest-email="walkUpGuestEmail"
              role="tabpanel"
              aria-labelledby="till-pane-tickets"
              tabindex="0"
              :looking-up="lookingUp"
              :camera-note="cameraNote"
              :lookup-failure="lookupFailure"
              :found="found"
              :ticket-lines="ticketLines"
              :tonights-performances="tonightsPerformances"
              :walk-up-options-failure="walkUpOptionsFailure"
              :walk-up-options="walkUpOptions"
              :walk-up-qty="walkUpQty"
              :walk-up-guest-incomplete="walkUpGuestIncomplete"
              :look-up="lookUp"
              :scan-decoded="scanDecoded"
              :open-camera="openCamera"
              :fall-back-to-typing="fallBackToTyping"
              :add-booking="addBooking"
              :bump-walk-up="bumpWalkUp"
              :add-walk-ups="addWalkUps"
            />

            <TillProductGrid
              v-show="pane === 'bar'"
              id="pane-bar-panel"
              role="tabpanel"
              aria-labelledby="till-pane-bar"
              tabindex="0"
              :categories="categories"
              :products-in="productsIn"
              :sizing="sizing"
              :choosing="choosing"
              :tap-product="tapProduct"
              :tap-variant="tapVariant"
              :choose-option="chooseOption"
              @open-allergens="allergenOpen = $event"
              @close-sizing="sizing = null"
              @close-choosing="choosing = null"
            />

            <TillBasket
              v-if="!basketEmpty"
              v-model:selected-discount-id="selectedDiscountId"
              v-model:selected-tab-holder-id="selectedTabHolderId"
              :ticket-lines="ticketLines"
              :walk-up-lines="walkUpLines"
              :basket="basket"
              :products="products"
              :line-amount="lineAmount"
              :remove-booking="removeBooking"
              :remove-walk-up="removeWalkUp"
              :decrement-line="decrementLine"
              :increment-line="incrementLine"
              :remove-line="removeLine"
              :discounts="discounts.data.value?.discounts ?? []"
              :tab-holders="tabHolders.data.value?.holders ?? []"
              :has-ticket-money="hasTicketMoney"
              :charge-failure="chargeFailure"
              :price-failure="priceFailure"
              :priced="priced"
              :grand-total-pence="grandTotalPence"
              :pricing="pricing"
              :tickets-pence="ticketsPence"
              :walk-ups-pence="walkUpsPence"
              @open-allergens="allergenOpen = $event"
            />
          </div>
        </template>

        <div
          v-else
          class="space-y-4"
          data-test="charge-confirmation"
        >
          <!-- The one number read across a bar, so it carries the block and the words stay
               short (F-104 criterion 6). -->
          <div
            class="rounded-xl bg-elevated px-4 py-5 text-center"
            data-test="charge-amount"
          >
            <p class="text-sm text-muted">
              {{ charged?.tab ? `On ${charged.tab.holderName}'s tab` : charged?.viaSumup ? 'Taken on SumUp' : 'Key this into the reader' }}
            </p>
            <p
              class="mt-1 font-mono text-5xl font-bold tabular-nums"
              data-test="charge-amount-figure"
            >
              {{ charged ? saysMoney(charged.totalPence) : '' }}
            </p>
          </div>
          <UAlert
            v-if="charged && charged.tickets.length"
            data-test="tickets-paid-note"
            color="info"
            variant="subtle"
            :description="`Paid: ${charged.tickets.map(ticket => ticket.reference).join(', ')}`"
          />
          <!-- The door pass (F-123 criterion 4): photographed off the screen, or printed. The
               print rule in the token source puts these on the paper and nothing else. -->
          <div
            v-if="charged?.walkUps.length"
            class="print-sheet space-y-4"
          >
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
            Print the pass
          </UButton>
          <UAlert
            v-if="charged && charged.refusedLines.length"
            data-test="age-check-refused-note"
            color="warning"
            variant="subtle"
            :description="`ID refused. Not sold: ${charged.refusedLines.map(line => line.productName).join(', ')}`"
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
            Next sale
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
        <!-- One row, not three: the count, the comp chip and the total share it, because every
             row here costs the thumb zone (K-102 criterion 2, issue 1150 item 8). -->
        <div
          v-if="session && !charged && (!basketEmpty || compRequestId !== null)"
          class="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2 text-sm"
          data-test="basket-summary-bar"
        >
          <span
            v-if="offline"
            data-test="till-offline"
          >No connection. Charging waits for it.</span>
          <template v-else>
            <span v-if="!basketEmpty">{{ plural(basketItemCount, 'item') }}</span>
            <UButton
              v-if="compRequestId === null && compEligible"
              size="sm"
              color="neutral"
              variant="subtle"
              class="min-h-12"
              icon="i-lucide-gift"
              data-test="till-comp-chip"
              @click="openCompModal"
            >
              Ask for a comp
            </UButton>
            <UButton
              v-else-if="compRequestId !== null"
              size="sm"
              :color="compDeclined ? 'error' : compLapsed ? 'warning' : 'neutral'"
              variant="subtle"
              class="min-h-12"
              icon="i-lucide-gift"
              data-test="till-comp-pending-chip"
              @click="openCompModal"
            >
              {{ compDeclined ? 'Comp declined' : compLapsed ? 'Comp lapsed' : compCanGive ? 'Give the comp' : compGiven ? 'Comp given' : 'Comp pending…' }}
            </UButton>
            <span
              v-if="!basketEmpty"
              data-test="basket-summary-total"
            >{{ grandTotalPence !== null && !pricing ? saysMoney(grandTotalPence) : 'Pricing…' }}</span>
          </template>
        </div>
        <!-- Offline, the buttons stay where the thumb expects them, disabled, with the line
             above saying why: a control that vanishes reads as a fault (issue 1150 item 7). -->
        <NightAction
          v-if="session && !charged && !basketEmpty && (grandTotalPence !== null || offline) && sumupAvailable && !sumup.pending.value && !compLocked"
          :label="sumupLabel"
          icon="i-lucide-smartphone-nfc"
          :disabled="pricing || walkUpGuestIncomplete || offline"
          :loading="charging"
          data-test="charge-sumup"
          @press="() => chargeOnSumUp()"
        />
        <NightAction
          v-if="session && !charged && !basketEmpty && (grandTotalPence !== null || offline) && !sumup.pending.value && !compLocked"
          :label="readerLabel"
          :icon="selectedTabHolderId ? 'i-lucide-book-user' : 'i-lucide-credit-card'"
          :color="sumupAvailable ? 'neutral' : 'primary'"
          :disabled="pricing || walkUpGuestIncomplete || offline"
          :loading="charging"
          data-test="charge-reader"
          @press="() => charge()"
        />
        <NightAction
          v-if="!session"
          label="Open till"
          icon="i-lucide-lock-open"
          :loading="busy"
          @press="open"
        />
      </template>
    </NightScreen>

    <TillAllergenModal
      :allergen-open="allergenOpen"
      @close="allergenOpen = null"
    />

    <TillChallenge25Modal
      v-model:step="ageCheckStep"
      :product="askingAgeCheckFor"
      :charging="chargeVia === 'comp' ? compGivingBusy : charging"
      @accept="submitAgeCheck"
      @refuse="submitAgeCheck"
    />

    <TillCompRequestModal
      v-model:open="compOpen"
      v-model:reason="compReason"
      :total-pence="compTotalPence"
      :sending="compSending"
      :send-failure="compSendFailure"
      :request-id="compRequestId"
      :request="compRequest"
      :can-give="compCanGive"
      :declined="compDeclined"
      :lapsed="compLapsed"
      :poll-failure="compPollFailure"
      :giving-busy="compGivingBusy"
      :give-failure="compGiveFailure"
      :given="compGiven !== null"
      @send="sendComp"
      @give="giveComp()"
      @done="nextSaleFromComp"
      @dismiss="dismissComp"
    />

    <TillCloseModal
      v-model:open="closeModalOpen"
      v-model:actual-z-pounds="actualZPounds"
      v-model:variance-note="varianceNote"
      :reconciliation-loading="reconciliationLoading"
      :reconciliation-failure="reconciliationFailure"
      :reconciliation="reconciliation"
      :refreshing="refreshing"
      :variance-preview-pence="variancePreviewPence"
      :close-failure="closeFailure"
      :closing-busy="closingBusy"
      @confirm="confirmClose"
    />
  </div>
</template>
