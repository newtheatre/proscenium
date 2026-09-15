<script setup lang="ts">
import { formatLondon, londonClock } from '#shared/utils/london'
import { saysMoney } from '#shared/utils/bar'
import type { InlineAgeCheckInput } from '#shared/utils/age-checks'
import type { SaleProduct, SaleReceipt } from '#shared/utils/sale'
import type { ChargedReceipt } from '~/composables/useSumUpCharge'
import type { AgeCheckStep } from '~/components/till/Challenge25Modal.vue'

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
  venues,
  venuesFailure,
  needsVenue,
  chooseVenue,
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
})

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
    ageCheckStep.value = 'closed'
  }
  catch (refused) {
    // K-103 protects reads, not writes: a transport failure needs different words from an
    // ordinary refusal, since whether the sale landed is unknown rather than settled (finding 16).
    chargeFailure.value = writeFailureText(refused, 'Check the last sale before ringing it up again.')
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
  return formatLondon(new Date(at * 1000), { timeStyle: 'short' })
}

// Whichever the modal answers with, the same submission the reader or SumUp path already had.
function submitAgeCheck(outcome: InlineAgeCheckInput): void {
  void (chargeVia.value === 'sumup' ? chargeOnSumUp(outcome) : charge(outcome))
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
        <UButton
          v-for="venue in venues"
          :key="venue.venueId"
          :data-test="`till-venue-${venue.venueId}`"
          color="neutral"
          variant="subtle"
          size="xl"
          block
          class="justify-between"
          @click="chooseVenue(venue.venueId)"
        >
          <span>{{ venue.venueName }}</span>
          <span class="text-xs text-muted">{{ venue.what }}</span>
        </UButton>
        <UAlert
          v-if="venuesFailure"
          data-test="till-venues-failure"
          color="error"
          variant="subtle"
          :description="venuesFailure"
        />
      </div>

      <UAlert
        v-else-if="failure"
        data-test="till-failure"
        color="error"
        variant="subtle"
        :description="failure"
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
            Open since {{ londonClock(new Date(session.openedAt * 1000)) }}.
          </p>
          <!-- Not a per-sale action, so it lives here rather than under the thumb (K-102
               criterion 2, review-ui.md finding 6). -->
          <UDropdownMenu
            :items="[[{ label: 'Close till', icon: 'i-lucide-lock', onSelect: openCloseModal }]]"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="sm"
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

          <TillTicketsPane
            v-if="pane === 'tickets'"
            v-model:lookup-term="lookupTerm"
            v-model:camera-open="cameraOpen"
            v-model:walk-up-performance-id="walkUpPerformanceId"
            v-model:walk-up-guest-name="walkUpGuestName"
            v-model:walk-up-guest-email="walkUpGuestEmail"
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
            :categories="categories"
            :products-in="productsIn"
            :choosing="choosing"
            :tap-variant="tapVariant"
            :choose-option="chooseOption"
            @open-allergens="allergenOpen = $event"
            @close-choosing="choosing = null"
          />

          <TillBasket
            v-if="!basketEmpty"
            v-model:selected-discount-id="selectedDiscountId"
            v-model:selected-tab-holder-id="selectedTabHolderId"
            :ticket-lines="ticketLines"
            :walk-up-lines="walkUpLines"
            :basket="basket"
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
          />
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
      :charging="charging"
      @accept="submitAgeCheck"
      @refuse="submitAgeCheck"
    />

    <TillCloseModal
      v-model:open="closeModalOpen"
      v-model:actual-z-pounds="actualZPounds"
      v-model:variance-note="varianceNote"
      :reconciliation-loading="reconciliationLoading"
      :reconciliation-failure="reconciliationFailure"
      :reconciliation="reconciliation"
      :variance-preview-pence="variancePreviewPence"
      :close-failure="closeFailure"
      :closing-busy="closingBusy"
      @confirm="confirmClose"
    />
  </div>
</template>
