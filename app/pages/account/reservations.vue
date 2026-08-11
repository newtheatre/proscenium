<script setup lang="ts">
definePageMeta({
  title: 'My Reservations',
  description: 'View and manage your reservations',
  middleware: 'auth',
})

const { data, status } = await useFetch('/api/bookings/my', {
  key: 'my-bookings',
  default: () => ({ upcoming: [], past: [] }),
})

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface PricedTicket {
  pricePaid: number
  priceConfidence?: 'EXACT' | 'DERIVED' | 'UNKNOWN'
}

function formatPrice(pence: number): string {
  if (pence === 0) return 'Free'
  return `£${(pence / 100).toFixed(2)}`
}

/**
 * What a booking cost, as a string.
 *
 * Imported legacy bookings can carry `priceConfidence: 'UNKNOWN'` with
 * `pricePaid: 0` — the old box office never recorded what was taken. Showing
 * that as "Free" tells someone who paid £8 in 2019 that they paid nothing, so
 * an unpriced booking says so instead of inventing a total.
 */
function formatBookingTotal(tickets: PricedTicket[]): string {
  if (tickets.length === 0) return formatPrice(0)
  if (tickets.every(t => t.priceConfidence === 'UNKNOWN')) return 'Price not recorded'

  const total = tickets.reduce((sum, t) => sum + t.pricePaid, 0)
  // Partially unpriced: the total is a floor, not the real figure.
  if (tickets.some(t => t.priceConfidence === 'UNKNOWN')) {
    return `${formatPrice(total)} (some prices not recorded)`
  }
  return formatPrice(total)
}

function getStatusColor(status: string) {
  switch (status) {
    case 'PENDING': return 'warning'
    case 'COLLECTED': return 'success'
    case 'DOOR': return 'success'
    case 'CANCELLED': return 'error'
    case 'NO_SHOW': return 'error'
    default: return 'neutral'
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'PENDING': return 'Pending Collection'
    case 'COLLECTED': return 'Collected'
    case 'DOOR': return 'On the Door'
    case 'CANCELLED': return 'Cancelled'
    case 'NO_SHOW': return 'No Show'
    default: return status
  }
}
</script>

<template>
  <div class="space-y-6">
    <UPageCard
      title="My Reservations"
      description="Your upcoming and past show reservations."
      variant="naked"
    />

    <!-- Loading -->
    <div
      v-if="status === 'pending'"
      class="space-y-4"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-24 w-full"
      />
    </div>

    <template v-else>
      <!-- Upcoming Reservations -->
      <UPageCard
        title="Upcoming"
        description="Shows you have tickets for."
        variant="subtle"
      >
        <template v-if="data.upcoming.length > 0">
          <div class="space-y-3">
            <UCard
              v-for="booking in data.upcoming"
              :key="booking.id"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <h4 class="font-semibold text-default">
                      {{ booking.performance.show.title }}
                    </h4>
                    <UBadge
                      :label="getStatusLabel(booking.status)"
                      :color="getStatusColor(booking.status)"
                      variant="subtle"
                      size="sm"
                    />
                  </div>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <span class="flex items-center gap-1">
                      <UIcon
                        name="i-lucide-calendar"
                        class="size-3.5"
                      />
                      {{ formatDate(booking.performance.startsAt) }} at {{ formatTime(booking.performance.startsAt) }}
                    </span>
                    <span class="flex items-center gap-1">
                      <UIcon
                        name="i-lucide-map-pin"
                        class="size-3.5"
                      />
                      {{ booking.performance.venue.name }}
                    </span>
                    <span class="flex items-center gap-1">
                      <UIcon
                        name="i-lucide-ticket"
                        class="size-3.5"
                      />
                      {{ booking.tickets.length }} ticket{{ booking.tickets.length !== 1 ? 's' : '' }}
                    </span>
                  </div>
                  <div class="text-xs text-muted font-mono">
                    Ref: {{ booking.bookingRef }}
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-medium text-default">
                    {{ formatBookingTotal(booking.tickets) }}
                  </div>
                  <NuxtLink
                    :to="`/whats-on/${booking.performance.show.slug}/booking/${booking.id}?ref=${booking.bookingRef}`"
                    class="text-sm text-primary hover:underline"
                  >
                    View
                  </NuxtLink>
                </div>
              </div>
            </UCard>
          </div>
        </template>

        <UEmpty
          v-else
          icon="i-lucide-calendar"
          title="No upcoming reservations"
          description="You don't have any upcoming show reservations."
        >
          <template #actions>
            <UButton
              label="Browse Shows"
              to="/whats-on"
              variant="subtle"
            />
          </template>
        </UEmpty>
      </UPageCard>

      <!-- Past Reservations -->
      <UPageCard
        title="Past"
        description="Shows you've previously attended."
        variant="subtle"
      >
        <template v-if="data.past.length > 0">
          <div class="space-y-3">
            <UCard
              v-for="booking in data.past"
              :key="booking.id"
              class="opacity-75"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <h4 class="font-semibold text-default">
                      {{ booking.performance.show.title }}
                    </h4>
                    <UBadge
                      :label="getStatusLabel(booking.status)"
                      :color="getStatusColor(booking.status)"
                      variant="subtle"
                      size="sm"
                    />
                  </div>
                  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <span class="flex items-center gap-1">
                      <UIcon
                        name="i-lucide-calendar"
                        class="size-3.5"
                      />
                      {{ formatDate(booking.performance.startsAt) }}
                    </span>
                    <span class="flex items-center gap-1">
                      <UIcon
                        name="i-lucide-map-pin"
                        class="size-3.5"
                      />
                      {{ booking.performance.venue.name }}
                    </span>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-medium text-default">
                    {{ formatBookingTotal(booking.tickets) }}
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </template>

        <UEmpty
          v-else
          icon="i-lucide-history"
          title="No past reservations"
          description="Your reservation history will appear here."
        />
      </UPageCard>
    </template>
  </div>
</template>
