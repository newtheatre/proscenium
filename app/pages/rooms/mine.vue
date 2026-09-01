<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'

definePageMeta({ middleware: 'signed-in' })

interface Booking {
  id: string
  room: string
  isExternal: boolean
  title: string
  attendees: number | null
  startsAt: number
  endsAt: number
  status: string
  rejectionReason: string | null
  cancellable: boolean
}

interface Listing { when: string, items: Booking[], total: number }

const toast = useToast()
const request = useRequestFetch()
const when = ref<'upcoming' | 'past'>('upcoming')
const cancelling = ref<Booking | null>(null)
const working = ref(false)

const { data, status, refresh } = await useAsyncData(
  () => `my-bookings-${when.value}`,
  () => request<Listing>('/api/rooms/bookings', { query: { when: when.value } }),
  { watch: [when], default: (): Listing => ({ when: 'upcoming', items: [], total: 0 }) },
)

const STATES: Record<string, { label: string, color: 'success' | 'warning' | 'neutral' | 'error' }> = {
  CONFIRMED: { label: 'Confirmed', color: 'success' },
  PENDING_APPROVAL: { label: 'Waiting on a decision', color: 'warning' },
  CANCELLED: { label: 'Cancelled', color: 'neutral' },
  REJECTED: { label: 'Turned down', color: 'error' },
  BUMPED: { label: 'Given to a higher priority', color: 'neutral' },
}

// An unregistered status shows as itself rather than falling out of the list (0027's habit).
const stateOf = (status: string): { label: string, color: 'success' | 'warning' | 'neutral' | 'error' } =>
  STATES[status] ?? { label: status, color: 'neutral' }

function spanOf(booking: Booking): string {
  const from = formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
  const to = formatLondon(new Date(booking.endsAt * 1000), { timeStyle: 'short' })
  return `${from} to ${to}`
}

async function cancel(): Promise<void> {
  const booking = cancelling.value
  if (!booking) return

  working.value = true
  try {
    await $fetch(`/api/rooms/bookings/${booking.id}/cancel`, { method: 'POST' })
    toast.add({
      title: 'Cancelled',
      description: booking.isExternal
        ? 'The Theatre Manager arranged this one with the SU and will need telling.'
        : 'The slot is free for somebody else.',
      icon: 'i-lucide-check',
      color: booking.isExternal ? 'warning' : 'success',
    })
    cancelling.value = null
    await refresh()
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    working.value = false
  }
}

useSeoMeta({ title: 'My bookings' })
</script>

<template>
  <UContainer class="max-w-3xl py-16">
    <UPageHeader
      title="My bookings"
      description="What you hold, and what became of what you held. Cancelling frees the slot straight away."
    />

    <UFieldGroup class="mt-6">
      <UButton
        :color="when === 'upcoming' ? 'primary' : 'neutral'"
        variant="outline"
        data-test="mine-upcoming"
        @click="when = 'upcoming'"
      >
        Coming up
      </UButton>
      <UButton
        :color="when === 'past' ? 'primary' : 'neutral'"
        variant="outline"
        data-test="mine-past"
        @click="when = 'past'"
      >
        Past
      </UButton>
    </UFieldGroup>

    <div
      v-if="status === 'pending'"
      class="mt-8 flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      <span>Reading your bookings.</span>
    </div>

    <p
      v-else-if="data.items.length === 0"
      class="mt-8 text-sm text-muted"
      data-test="mine-empty"
    >
      <template v-if="when === 'upcoming'">
        Nothing booked yet. <ULink to="/rooms">
          Find a free slot
        </ULink> and it appears here.
      </template>
      <template v-else>
        Nothing in the past yet.
      </template>
    </p>

    <ul
      v-else
      class="mt-8 divide-y divide-default"
      data-test="mine-list"
    >
      <li
        v-for="booking in data.items"
        :key="booking.id"
        class="flex flex-wrap items-start gap-3 py-4"
        :data-test="`booking-${booking.id}`"
      >
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-center gap-2 font-medium">
            {{ booking.room }}
            <UBadge
              :color="stateOf(booking.status).color"
              variant="subtle"
              size="sm"
            >
              {{ stateOf(booking.status).label }}
            </UBadge>
            <UBadge
              v-if="booking.isExternal"
              color="info"
              variant="subtle"
              size="sm"
            >
              Booked through the SU
            </UBadge>
          </p>
          <p class="text-sm text-muted">
            {{ spanOf(booking) }}
          </p>
          <p class="text-sm">
            {{ booking.title }}
          </p>
          <p
            v-if="booking.rejectionReason"
            class="mt-1 text-sm text-error"
          >
            {{ booking.rejectionReason }}
          </p>
        </div>

        <UButton
          v-if="booking.cancellable"
          size="sm"
          color="error"
          variant="subtle"
          :data-test="`cancel-${booking.id}`"
          @click="cancelling = booking"
        >
          Cancel
        </UButton>
      </li>
    </ul>

    <p
      v-if="data.items.length"
      class="mt-6 text-sm text-muted"
    >
      {{ plural(data.total, 'booking') }}
    </p>

    <!-- Asked before doing it: the slot goes to whoever wants it next, and there is no undo. -->
    <UModal
      :open="cancelling !== null"
      title="Cancel this booking?"
      :description="cancelling ? `${cancelling.room}, ${spanOf(cancelling)}` : ''"
      @update:open="cancelling = null"
    >
      <template #body>
        <p class="text-sm">
          The slot frees straight away and somebody else may take it. Cancelling cannot be undone;
          you would have to book again.
        </p>
        <UAlert
          v-if="cancelling?.isExternal"
          class="mt-4"
          color="warning"
          variant="subtle"
          icon="i-lucide-hand"
          description="This room was arranged with the SU by hand, so the Theatre Manager will need telling as well."
        />
      </template>

      <template #footer>
        <div class="flex flex-wrap gap-2">
          <UButton
            color="error"
            :loading="working"
            data-test="cancel-confirm"
            @click="cancel"
          >
            Cancel the booking
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="cancelling = null"
          >
            Keep it
          </UButton>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
