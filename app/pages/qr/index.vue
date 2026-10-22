<script setup lang="ts">
import type * as z from 'zod'
import { CONFIRM_BACK_LABEL } from '#shared/utils/admin-conventions'
import { SAYS_BEFORE_YOU_COME } from '#shared/utils/content-warnings'
import { belowMinimumTicketsReason, exchangeTooSoon, qrStatusDisplay, qrStatusTone, reservationResendForm, saysExchangeNight, saysExchangeTooSoon, stepperMax } from '#shared/utils/reservations'
import type { OwnBookingListing } from '#shared/utils/reservations'
import { saysPrice } from '#shared/utils/ticket-types'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

type Outcome = 'working' | 'found' | 'resend' | 'sent'

interface NamedLine {
  ticketTypeId: string
  ticketTypeName: string
  quantity: number
  totalPence: number
}

interface Booking {
  reference: string
  status: string
  cancelledBy: string | null
  show: string
  // Null once the booking is no longer somebody coming
  guidance: { lines: string[], slug: string | null } | null
  passBooking: boolean
  when: string
  totalDue: string | null
  refunded: string | null
  qrSvg: string
  lines: NamedLine[]
  venue: { name: string, address: string | null }
  doors: string | null
  releasesAt: string | null
  bookAgainUrl: string | null
  exchangedTo: { showTitle: string, when: string, reference?: string } | null
}

interface BookableType {
  id: string
  name: string
  price: number
}

interface ExchangeOption {
  id: string
  startsAt: number
  venueName: string
  availability: string
  says: string
  bookingClosesAt: number
  holdExpiresAt: number
  totalPence: number | null
}

const SOLD_OUT_OR_CLOSED = ['SOLD_OUT', 'BOOKING_CLOSED']

const route = useRoute()
const outcome = ref<Outcome>('working')
const booking = ref<Booking | null>(null)
const notice = ref('')

// Read once and let go, so only the arrival straight from booking is headed "Booking made"
// (issue 1329, D-104 criterion 8); a reload or a later visit shows the booking plainly.
const made = useBookingMade()
const justMade = ref(made.value)

const resendFields: AuthFormField[] = [
  { name: 'reference', type: 'text', label: 'Booking reference', autocomplete: 'off', required: true },
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
]

async function loadBooking(): Promise<void> {
  booking.value = await $fetch<Booking>('/api/qr/current')
  outcome.value = 'found'
}

// A signed-in visitor sees their own bookings whatever the cookie holds: under the one it opened,
// or in place of asking for a reference the account already knows (issue 1332).
const { account } = useAccount()
const ownBookings = ref<OwnBookingListing[] | null>(null)
const otherBookings = computed(() => ownBookings.value?.filter(own => own.reference !== booking.value?.reference) ?? [])

async function loadOwnBookings(): Promise<void> {
  if (!account.value.signedIn) return
  ownBookings.value = await $fetch<{ bookings: OwnBookingListing[] }>('/api/account/bookings')
    .then(answer => answer.bookings)
    .catch(() => null)
}

// The exchanged cookie names the booking; a missing or spent one is an invitation to resend,
// never a dead end (D-108 criterion 2 sits next to criterion 4 for exactly this reason).
onMounted(async () => {
  made.value = null
  const own = loadOwnBookings()
  try {
    await loadBooking()
  }
  catch {
    outcome.value = 'resend'
  }
  await own
})

// A refusal (the rate limit, chiefly) is said beside the form; swallowed, the button seemed dead.
const resendFailure = ref<string | null>(null)

async function resend(payload: FormSubmitEvent<z.output<typeof reservationResendForm>>): Promise<void> {
  resendFailure.value = null
  try {
    const result = await $fetch<{ message: string }>('/api/reservations/resend', { method: 'POST', body: payload.data })
    notice.value = result.message
    outcome.value = 'sent'
  }
  catch (error) {
    resendFailure.value = refusalText(error, 'That did not go through. Try again in a few minutes.')
  }
}

const display = computed(() => booking.value
  ? qrStatusDisplay(booking.value.status, booking.value.cancelledBy, booking.value.totalDue, booking.value.exchangedTo, booking.value.refunded)
  : null)
const tone = computed(() => booking.value
  ? qrStatusTone(booking.value.status, booking.value.totalDue, booking.value.exchangedTo !== null)
  : 'neutral')

const where = computed(() => booking.value
  ? [booking.value.venue.name, booking.value.venue.address].filter(Boolean).join(', ')
  : '')

const resendHeadline = computed(() => (route.query.refused ? 'That link isn\'t valid' : 'Open your booking from your email'))
// A refused link landing on a booking this browser remembers must not read as the link working.
const refusedAboveRemembered = computed(() => Boolean(route.query.refused))
// A lapsed or cancelled booking admits nobody, so the page does not say to show it at the door.
const admits = computed(() => booking.value !== null && !['EXPIRED', 'CANCELLED', 'NO_SHOW'].includes(booking.value.status))

// D-110: editing and cancelling while unpaid, both against the same cookie the QR page already
// reads with (criterion 5: the same page reflects whatever the edit or cancel leaves behind).
const editing = ref(false)
const editLoading = ref(false)
const editFailure = ref<string | null>(null)
const bookableTypes = ref<BookableType[]>([])
const quantities = ref<Record<string, number>>({})
const editCap = ref(1)

async function startEdit(): Promise<void> {
  editFailure.value = null
  editLoading.value = true
  try {
    const options = await $fetch<{ ticketTypes: BookableType[], lines: NamedLine[], cap: number }>('/api/qr/edit-options', { query: { reference: booking.value?.reference } })
    bookableTypes.value = options.ticketTypes
    editCap.value = options.cap
    const seeded: Record<string, number> = {}
    for (const type of options.ticketTypes) seeded[type.id] = 0
    for (const line of options.lines) seeded[line.ticketTypeId] = line.quantity
    quantities.value = seeded
    editing.value = true
  }
  catch (error) {
    editFailure.value = refusalText(error)
  }
  finally {
    editLoading.value = false
  }
}

const editSaving = ref(false)

// The form's own running figures, so a change is priced before it is saved and an empty booking is
// pointed at Cancel rather than refused after Save (D-110 criteria 2, 6).
const editSeats = computed(() => Object.values(quantities.value).reduce((total, quantity) => total + quantity, 0))
const editTotalPence = computed(() => bookableTypes.value.reduce((total, type) => total + type.price * (quantities.value[type.id] ?? 0), 0))
const editZero = computed(() => belowMinimumTicketsReason(editSeats.value))

async function saveEdit(): Promise<void> {
  editSaving.value = true
  editFailure.value = null
  try {
    const lines = Object.entries(quantities.value)
      .filter(([, quantity]) => quantity > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))
    await $fetch('/api/qr/tickets', { method: 'PUT', body: { lines, reference: booking.value?.reference } })
    editing.value = false
    justMade.value = null
    await Promise.all([loadBooking(), loadOwnBookings()])
  }
  catch (error) {
    editFailure.value = refusalText(error)
  }
  finally {
    editSaving.value = false
  }
}

const cancelling = ref(false)
const cancelConfirming = ref(false)
const cancelFailure = ref<string | null>(null)

async function cancelBooking(): Promise<void> {
  cancelling.value = true
  cancelFailure.value = null
  try {
    await $fetch('/api/qr/cancel', { method: 'POST', body: { reference: booking.value?.reference } })
    cancelConfirming.value = false
    justMade.value = null
    await Promise.all([loadBooking(), loadOwnBookings()])
  }
  catch (error) {
    cancelFailure.value = refusalText(error)
  }
  finally {
    cancelling.value = false
  }
}

// D-111: moving the booking to another performance of the same show, while unpaid.
const exchanging = ref(false)
const exchangeLoading = ref(false)
const exchangeSubmitting = ref(false)
const exchangeFailure = ref<string | null>(null)
const exchangeOptions = ref<ExchangeOption[]>([])
const exchangeChoice = ref<string | undefined>(undefined)
const exchangeCurrentTotal = ref(0)
const exchangeChosen = computed(() => exchangeOptions.value.find(option => option.id === exchangeChoice.value) ?? null)
const exchangeReadAt = ref(0)
// Said once the exchange lands, because the booking the page now shows has a new reference (D-111 criterion 4).
const exchangedFrom = ref<string | null>(null)

async function startExchange(): Promise<void> {
  exchangeFailure.value = null
  exchangeLoading.value = true
  try {
    const options = await $fetch<{ performances: ExchangeOption[], currentTotalPence: number }>('/api/qr/exchange-options', { query: { reference: booking.value?.reference } })
    exchangeOptions.value = options.performances
    exchangeReadAt.value = Math.floor(Date.now() / 1000)
    exchangeCurrentTotal.value = options.currentTotalPence
    exchangeChoice.value = undefined
    exchanging.value = true
  }
  catch (error) {
    exchangeFailure.value = refusalText(error)
  }
  finally {
    exchangeLoading.value = false
  }
}

async function submitExchange(): Promise<void> {
  if (!exchangeChoice.value) return
  exchangeSubmitting.value = true
  exchangeFailure.value = null
  try {
    const old = booking.value?.reference ?? null
    await $fetch('/api/qr/exchange', { method: 'POST', body: { performanceId: exchangeChoice.value, reference: booking.value?.reference } })
    exchangedFrom.value = old
    exchanging.value = false
    justMade.value = null
    await Promise.all([loadBooking(), loadOwnBookings()])
  }
  catch (error) {
    exchangeFailure.value = refusalText(error)
  }
  finally {
    exchangeSubmitting.value = false
  }
}

useSeoMeta({ title: 'Your booking' })
</script>

<template>
  <UContainer class="max-w-md py-16">
    <UPageCard>
      <div
        v-if="outcome === 'working'"
        class="flex items-center gap-3 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Finding your booking.</span>
      </div>

      <div
        v-else-if="outcome === 'found' && booking && display"
        data-test="booking-found"
        class="space-y-3"
      >
        <UAlert
          v-if="refusedAboveRemembered"
          color="warning"
          variant="subtle"
          icon="i-lucide-link-2-off"
          title="That link is not valid"
          description="It may have expired or been mistyped. This is the booking this browser opened last, not the one the link was for. Open the link from your newest email."
          data-test="booking-refused-link"
        />
        <div
          v-if="justMade"
          class="space-y-1 border-b border-default pb-3"
          data-test="booking-made"
        >
          <h1 class="nnt-headline text-2xl">
            Booking made
          </h1>
          <p class="text-sm text-muted">
            We have emailed the reference and your QR code to {{ justMade.emailedTo ?? 'the address this booking was made with' }}.
            Bring either one to the box office.
          </p>
        </div>
        <component
          :is="justMade ? 'h2' : 'h1'"
          class="nnt-headline text-xl"
        >
          {{ booking.show }}
        </component>
        <p class="text-muted">
          {{ booking.when }}
        </p>
        <p
          class="text-sm text-muted"
          data-test="booking-where"
        >
          {{ where }}<template v-if="booking.doors">
            · Doors {{ booking.doors }}
          </template>
        </p>
        <p class="text-sm text-muted">
          Reference {{ booking.reference }}
        </p>
        <UAlert
          v-if="exchangedFrom"
          color="info"
          variant="subtle"
          icon="i-lucide-arrow-right-left"
          :description="`Exchanged. This booking has a new reference, ${booking.reference}; the old one, ${exchangedFrom}, no longer admits anybody. We have emailed the new code.`"
          data-test="booking-exchanged-notice"
        />
        <UBadge
          data-test="booking-status"
          size="lg"
          :color="tone"
          variant="subtle"
        >
          {{ display.headline }}
        </UBadge>
        <p
          v-if="display.detail"
          class="text-muted"
        >
          {{ display.detail }}
        </p>

        <ul
          v-if="booking.lines.length > 0"
          class="space-y-1 text-sm"
          data-test="booking-lines"
        >
          <li
            v-for="line in booking.lines"
            :key="line.ticketTypeId"
            class="flex justify-between"
          >
            <span>{{ line.ticketTypeName }} &times; {{ line.quantity }}</span>
            <span class="font-mono">{{ saysPrice(line.totalPence) }}</span>
          </li>
        </ul>

        <p
          v-if="booking.releasesAt && booking.totalDue"
          class="text-sm text-muted"
          data-test="booking-release"
        >
          Unpaid, this booking is released on {{ booking.releasesAt }} and its seats go back on sale.
        </p>

        <div
          v-if="booking.bookAgainUrl"
          class="flex flex-wrap gap-2"
          data-test="booking-book-again"
        >
          <UButton :to="booking.bookAgainUrl">
            Book again
          </UButton>
          <UButton
            to="/whats-on"
            color="neutral"
            variant="subtle"
          >
            See what's on
          </UButton>
        </div>

        <!-- A cancelled booking admits nobody, so its code is not offered to be saved (issue
             1329); the door still answers a scan of an old copy with the reason (D-108). -->
        <template v-if="booking.status !== 'CANCELLED'">
          <img
            :src="`data:image/svg+xml;base64,${booking.qrSvg}`"
            alt="Booking QR code"
            width="200"
            height="200"
            data-test="booking-qr"
          >
          <p
            v-if="admits"
            class="text-xs text-muted"
          >
            Save this image to keep the code, or show this page at the door.
          </p>
        </template>

        <!-- Criterion 4: nothing self-service left to offer once money has moved; a refund is a
             box office conversation, not a form (D-116). -->
        <UAlert
          v-if="booking.status === 'COLLECTED'"
          data-test="booking-refund-policy"
          color="neutral"
          variant="subtle"
          title="Already paid"
          description="You have paid for this booking. Refunds are handled in person at the box office; bring your reference."
        />

        <BeforeYouBook
          v-if="booking.guidance"
          :lines="booking.guidance.lines"
          :slug="booking.guidance.slug"
          :heading="SAYS_BEFORE_YOU_COME"
        />

        <div
          v-if="booking.status === 'PENDING' && booking.passBooking"
          class="text-sm text-muted"
          data-test="booking-pass-note"
        >
          Made with your pass. To change or cancel it, contact the box office.
        </div>

        <div
          v-else-if="booking.status === 'PENDING' && !editing && !exchanging"
          class="flex flex-wrap gap-2 pt-2"
        >
          <UButton
            data-test="booking-edit-start"
            color="neutral"
            variant="subtle"
            :loading="editLoading"
            @click="startEdit"
          >
            Change tickets
          </UButton>
          <UButton
            data-test="booking-exchange-start"
            color="neutral"
            variant="subtle"
            :loading="exchangeLoading"
            @click="startExchange"
          >
            Exchange for another night
          </UButton>
          <UButton
            data-test="booking-cancel-start"
            color="error"
            variant="subtle"
            @click="cancelConfirming = true"
          >
            Cancel booking
          </UButton>
        </div>

        <UAlert
          v-if="editFailure"
          color="error"
          variant="subtle"
          :description="editFailure"
        />

        <UAlert
          v-if="exchangeFailure"
          color="error"
          variant="subtle"
          :description="exchangeFailure"
        />

        <div
          v-if="exchanging"
          class="space-y-3 border-t border-default pt-4"
          data-test="booking-exchange-form"
        >
          <p class="text-sm text-muted">
            Same tickets, another night of this show, at that night's prices.
            The booking gets a new reference and a new code, and the old ones stop working.
          </p>
          <URadioGroup
            v-model="exchangeChoice"
            :items="exchangeOptions.map(option => {
              const night = saysExchangeNight(option)
              const tooSoon = !SOLD_OUT_OR_CLOSED.includes(option.availability) && exchangeTooSoon(option.holdExpiresAt, exchangeReadAt)
              return {
                label: night.label,
                description: tooSoon
                  ? `${option.venueName} · ${saysExchangeTooSoon(option.holdExpiresAt)}`
                  : option.totalPence === null ? `${night.description} · not every ticket type is offered` : `${night.description} · ${saysPrice(option.totalPence)}`,
                value: option.id,
                disabled: SOLD_OUT_OR_CLOSED.includes(option.availability) || option.totalPence === null || tooSoon,
              }
            })"
            data-test="booking-exchange-options"
          />
          <p
            v-if="exchangeChosen && exchangeChosen.totalPence !== null"
            class="text-sm"
            data-test="booking-exchange-total"
          >
            New total {{ saysPrice(exchangeChosen.totalPence) }}, was {{ saysPrice(exchangeCurrentTotal) }}.
            Still paid at the box office on the night.
          </p>
          <p
            v-if="exchangeOptions.length === 0"
            class="text-sm text-muted"
          >
            No other performance of this show is on sale right now.
          </p>
          <div class="flex gap-2">
            <UButton
              data-test="booking-exchange-submit"
              :loading="exchangeSubmitting"
              :disabled="!exchangeChoice"
              @click="submitExchange"
            >
              Exchange booking
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="exchanging = false"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </div>

        <div
          v-if="editing"
          class="space-y-3 border-t border-default pt-4"
          data-test="booking-edit-form"
        >
          <div
            v-for="type in bookableTypes"
            :key="type.id"
            class="flex items-center justify-between gap-3"
          >
            <span class="text-sm">{{ type.name }} <span class="font-mono text-muted">{{ saysPrice(type.price) }}</span></span>
            <UInputNumber
              v-model="quantities[type.id]"
              v-bind="TOUCH_STEPPER"
              class="shrink-0"
              :min="0"
              :max="stepperMax(quantities, type.id, editCap)"
              :aria-label="`${type.name} tickets`"
              :data-test="`booking-edit-quantity-${type.id}`"
            />
          </div>
          <p
            class="flex justify-between text-sm"
            data-test="booking-edit-total"
          >
            <span>New total, to pay at the theatre</span>
            <span class="font-mono">{{ saysPrice(editTotalPence) }}</span>
          </p>
          <div
            v-if="editZero"
            class="space-y-2"
            data-test="booking-edit-zero"
          >
            <p class="text-sm text-muted">
              {{ editZero }}
            </p>
            <UButton
              color="error"
              variant="subtle"
              @click="editing = false; cancelConfirming = true"
            >
              Cancel booking
            </UButton>
          </div>
          <div class="flex gap-2">
            <UButton
              data-test="booking-edit-save"
              :loading="editSaving"
              :disabled="editZero !== null"
              @click="saveEdit"
            >
              Save changes
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="editing = false"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </div>

        <OwnBookings
          v-if="otherBookings.length > 0"
          :bookings="otherBookings"
          heading="Your other bookings"
          level="h2"
          class="border-t border-default pt-4"
        />

        <ConfirmModal
          v-model:open="cancelConfirming"
          name="cancel-booking"
          title="Cancel this booking"
          verb="Cancel this booking"
          consequence="Nothing has been charged, so nothing needs refunding. The seats go back on sale straight away."
          :loading="cancelling"
          :failure="cancelFailure"
          @confirm="cancelBooking"
        />
      </div>

      <div
        v-else-if="outcome === 'sent'"
        class="space-y-2"
      >
        <h1 class="nnt-headline text-xl">
          Check your email
        </h1>
        <p class="text-muted">
          {{ notice }}
        </p>
      </div>

      <div
        v-else
        data-test="qr-resend"
        class="space-y-4"
      >
        <OwnBookings
          v-if="ownBookings"
          :bookings="ownBookings"
          heading="Your bookings"
          level="h1"
          class="border-b border-default pb-4"
        >
          <p
            v-if="ownBookings.length === 0"
            class="text-sm text-muted"
          >
            You have no bookings still to come. <NuxtLink
              to="/whats-on"
              class="underline"
            >See what is on</NuxtLink>.
          </p>
          <p class="text-sm text-muted">
            Passes you hold, each with its QR code, are under <NuxtLink
              to="/account/passes"
              class="underline"
            >Passes</NuxtLink>.
          </p>
        </OwnBookings>

        <div class="space-y-2">
          <component
            :is="ownBookings ? 'h2' : 'h1'"
            class="nnt-headline text-xl"
          >
            {{ resendHeadline }}
          </component>
          <p class="text-muted">
            Enter your booking reference and the email address you booked with, and a fresh copy of
            your confirmation, with the same QR, is on its way.
          </p>
          <p class="text-sm text-muted">
            Only an unpaid booking is sent again. Once paid, give your reference at the box office or
            the door; it is all they need to find you.
          </p>
        </div>
        <UAlert
          v-if="resendFailure"
          color="error"
          variant="subtle"
          :description="resendFailure"
          data-test="qr-resend-failure"
        />

        <UAuthForm
          :schema="reservationResendForm"
          :fields="resendFields"
          :submit="{ label: 'Resend it' }"
          @submit="resend"
        />
      </div>
    </UPageCard>
  </UContainer>
</template>
