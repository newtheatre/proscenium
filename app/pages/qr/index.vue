<script setup lang="ts">
import type * as z from 'zod'
import { qrStatusDisplay, reservationResendForm } from '#shared/utils/reservations'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

type Outcome = 'working' | 'found' | 'resend' | 'sent'

interface NamedLine {
  ticketTypeId: string
  ticketTypeName: string
  quantity: number
}

interface Booking {
  reference: string
  status: string
  cancelledBy: string | null
  show: string
  when: string
  totalDue: string | null
  qrSvg: string
  lines: NamedLine[]
  exchangedTo: { showTitle: string, when: string } | null
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
}

const route = useRoute()
const outcome = ref<Outcome>('working')
const booking = ref<Booking | null>(null)
const notice = ref('')

const resendFields: AuthFormField[] = [
  { name: 'reference', type: 'text', label: 'Booking reference', autocomplete: 'off', required: true },
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
]

async function loadBooking(): Promise<void> {
  booking.value = await $fetch<Booking>('/api/qr/current')
  outcome.value = 'found'
}

// The exchanged cookie names the booking; a missing or spent one is an invitation to resend,
// never a dead end (D-108 criterion 2 sits next to criterion 4 for exactly this reason).
onMounted(async () => {
  try {
    await loadBooking()
  }
  catch {
    outcome.value = 'resend'
  }
})

async function resend(payload: FormSubmitEvent<z.output<typeof reservationResendForm>>): Promise<void> {
  const result = await $fetch<{ message: string }>('/api/reservations/resend', { method: 'POST', body: payload.data })
  notice.value = result.message
  outcome.value = 'sent'
}

const display = computed(() => booking.value
  ? qrStatusDisplay(booking.value.status, booking.value.cancelledBy, booking.value.totalDue, booking.value.exchangedTo)
  : null)
const resendHeadline = computed(() => (route.query.refused ? 'That link isn\'t valid' : 'Open your booking from your email'))

// D-110: editing and cancelling while unpaid, both against the same cookie the QR page already
// reads with (criterion 5: the same page reflects whatever the edit or cancel leaves behind).
const editing = ref(false)
const editLoading = ref(false)
const editFailure = ref<string | null>(null)
const bookableTypes = ref<BookableType[]>([])
const quantities = ref<Record<string, number>>({})

async function startEdit(): Promise<void> {
  editFailure.value = null
  editLoading.value = true
  try {
    const options = await $fetch<{ ticketTypes: BookableType[], lines: NamedLine[] }>('/api/qr/edit-options')
    bookableTypes.value = options.ticketTypes
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

async function saveEdit(): Promise<void> {
  editSaving.value = true
  editFailure.value = null
  try {
    const lines = Object.entries(quantities.value)
      .filter(([, quantity]) => quantity > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))
    await $fetch('/api/qr/tickets', { method: 'PUT', body: { lines } })
    editing.value = false
    await loadBooking()
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
    await $fetch('/api/qr/cancel', { method: 'POST' })
    cancelConfirming.value = false
    await loadBooking()
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
const exchangeChoice = ref<string | null>(null)

async function startExchange(): Promise<void> {
  exchangeFailure.value = null
  exchangeLoading.value = true
  try {
    const options = await $fetch<{ performances: ExchangeOption[] }>('/api/qr/exchange-options')
    exchangeOptions.value = options.performances
    exchangeChoice.value = null
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
    await $fetch('/api/qr/exchange', { method: 'POST', body: { performanceId: exchangeChoice.value } })
    exchanging.value = false
    await loadBooking()
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
        <h1 class="nnt-headline text-xl">
          {{ booking.show }}
        </h1>
        <p class="text-muted">
          {{ booking.when }}
        </p>
        <p class="text-sm text-muted">
          Reference {{ booking.reference }}
        </p>
        <UBadge
          data-test="booking-status"
          size="lg"
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
            <span>{{ line.ticketTypeName }}</span>
            <span>&times;{{ line.quantity }}</span>
          </li>
        </ul>

        <img
          :src="`data:image/svg+xml;base64,${booking.qrSvg}`"
          alt="Booking QR code"
          width="200"
          height="200"
          data-test="booking-qr"
        >
        <p class="text-xs text-muted">
          Save this image to keep the code, or show this page at the door.
        </p>

        <!-- Criterion 4: nothing self-service left to offer once money has moved; a refund is a
             box office conversation, not a form (D-116). -->
        <UAlert
          v-if="booking.status === 'COLLECTED'"
          data-test="booking-refund-policy"
          color="neutral"
          variant="subtle"
          title="Already paid"
          description="This booking has been collected. Refunds are handled in person at the box office; bring your reference."
        />

        <div
          v-if="booking.status === 'PENDING' && !editing && !exchanging"
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
            Same tickets, another night of this show. Prices reflect that performance and may differ.
          </p>
          <URadioGroup
            v-model="exchangeChoice"
            :items="exchangeOptions.map(option => ({
              label: `${option.venueName}: ${option.says}`,
              value: option.id,
              disabled: option.availability === 'SOLD_OUT' || option.availability === 'BOOKING_CLOSED',
            }))"
            data-test="booking-exchange-options"
          />
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
              Cancel
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
            <span class="text-sm">{{ type.name }}</span>
            <UInputNumber
              v-model="quantities[type.id]"
              :min="0"
              :max="99"
              :data-test="`booking-edit-quantity-${type.id}`"
            />
          </div>
          <div class="flex gap-2">
            <UButton
              data-test="booking-edit-save"
              :loading="editSaving"
              @click="saveEdit"
            >
              Save changes
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="editing = false"
            >
              Cancel
            </UButton>
          </div>
        </div>

        <UAlert
          v-if="cancelFailure"
          color="error"
          variant="subtle"
          :description="cancelFailure"
        />

        <div
          v-if="cancelConfirming"
          class="space-y-3 border-t border-default pt-4"
          data-test="booking-cancel-confirm"
        >
          <p class="text-sm text-muted">
            Cancel this booking? Nothing has been charged, so nothing needs refunding, but the
            seats go back on sale immediately.
          </p>
          <div class="flex gap-2">
            <UButton
              data-test="booking-cancel-confirm-submit"
              color="error"
              :loading="cancelling"
              @click="cancelBooking"
            >
              Yes, cancel it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="cancelConfirming = false"
            >
              Keep it
            </UButton>
          </div>
        </div>
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
        <div class="space-y-2">
          <h1 class="nnt-headline text-xl">
            {{ resendHeadline }}
          </h1>
          <p class="text-muted">
            Enter your booking reference and the email address you booked with, and a fresh copy of
            your confirmation, with the same QR, is on its way.
          </p>
        </div>

        <UAuthForm
          title="Resend my confirmation"
          :schema="reservationResendForm"
          :fields="resendFields"
          :submit="{ label: 'Resend it' }"
          @submit="resend"
        />
      </div>
    </UPageCard>
  </UContainer>
</template>
