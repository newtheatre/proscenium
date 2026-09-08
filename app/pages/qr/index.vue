<script setup lang="ts">
import type * as z from 'zod'
import { qrStatusDisplay, reservationResendForm } from '#shared/utils/reservations'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

type Outcome = 'working' | 'found' | 'resend' | 'sent'

interface Booking {
  reference: string
  status: string
  cancelledBy: string | null
  show: string
  when: string
  totalDue: string | null
  qrSvg: string
}

const route = useRoute()
const outcome = ref<Outcome>('working')
const booking = ref<Booking | null>(null)
const notice = ref('')

const resendFields: AuthFormField[] = [
  { name: 'reference', type: 'text', label: 'Booking reference', autocomplete: 'off', required: true },
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
]

// The exchanged cookie names the booking; a missing or spent one is an invitation to resend,
// never a dead end (D-108 criterion 2 sits next to criterion 4 for exactly this reason).
onMounted(async () => {
  try {
    booking.value = await $fetch<Booking>('/api/qr/current')
    outcome.value = 'found'
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

const display = computed(() => booking.value ? qrStatusDisplay(booking.value.status, booking.value.cancelledBy, booking.value.totalDue) : null)
const resendHeadline = computed(() => (route.query.refused ? 'That link isn\'t valid' : 'Open your booking from your email'))

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
