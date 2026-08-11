<script setup lang="ts">
/**
 * Booking confirmation display.
 *
 * Shows the booking reference, performance details, and ticket summary
 * after a successful booking. Provides actions for the user.
 */
interface Ticket {
  id: string
  pricePaid: number
  ticketType: { id: string, name: string }
}

interface Booking {
  id: string
  bookingRef: string
  status: string
  customerNotes: string | null
  user: { id: string, name: string, email: string }
  performance: {
    startsAt: string | Date
    doorsAt: string | Date | null
    durationMinutes: number | null
    show: { id: string, title: string, slug: string }
    venue: { id: string, name: string, address?: string | null }
  }
  tickets: Ticket[]
}

const props = defineProps<{
  booking: Booking
}>()

const isCancelled = computed(() => props.booking.status === 'CANCELLED')

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPrice(pence: number): string {
  if (pence === 0) return 'Free'
  return `£${(pence / 100).toFixed(2)}`
}

function getTicketSummary(tickets: Ticket[]) {
  // Group by ticket type AND price paid, so a type sold at more than one price
  // (e.g. after a price change) shows one line per price and the line totals
  // sum to the grand total.
  const grouped = new Map<string, { name: string, count: number, unitPrice: number }>()
  for (const ticket of tickets) {
    const key = `${ticket.ticketType.id}:${ticket.pricePaid}`
    const existing = grouped.get(key)
    if (existing) {
      existing.count++
    }
    else {
      grouped.set(key, {
        name: ticket.ticketType.name,
        count: 1,
        unitPrice: ticket.pricePaid,
      })
    }
  }
  return Array.from(grouped.values())
}

function getTotal(tickets: Ticket[]) {
  return tickets.reduce((sum, t) => sum + t.pricePaid, 0)
}
</script>

<template>
  <div class="space-y-8">
    <!-- Status header -->
    <div class="text-center space-y-3">
      <div
        class="mx-auto flex size-16 items-center justify-center rounded-full"
        :class="isCancelled ? 'bg-error/10' : 'bg-success/10'"
      >
        <UIcon
          :name="isCancelled ? 'i-lucide-x-circle' : 'i-lucide-check-circle'"
          class="size-8"
          :class="isCancelled ? 'text-error' : 'text-success'"
        />
      </div>
      <h2 class="text-2xl font-bold text-default">
        {{ isCancelled ? 'Booking Cancelled' : 'Booking Confirmed!' }}
      </h2>
      <p class="text-muted">
        <template v-if="isCancelled">
          This booking has been cancelled. If you believe this is a mistake, please contact the box office.
        </template>
        <template v-else>
          Your reservation has been made. A confirmation email has been sent to
          <span class="font-medium text-default">{{ booking.user.email }}</span>.
        </template>
      </p>
    </div>

    <!-- Booking reference -->
    <div class="text-center">
      <p class="text-sm text-muted mb-1">
        Your Booking Reference
      </p>
      <div class="inline-flex items-center gap-2 rounded-lg bg-elevated px-6 py-3 border border-default">
        <span class="text-3xl font-mono font-bold tracking-widest text-primary">
          {{ booking.bookingRef }}
        </span>
      </div>
      <p class="text-xs text-muted mt-2">
        Please quote this reference when collecting your tickets at the box office.
      </p>
    </div>

    <!-- Show & Performance details -->
    <UCard>
      <div class="space-y-3">
        <h3 class="font-semibold text-default text-lg">
          {{ booking.performance.show.title }}
        </h3>

        <div class="grid sm:grid-cols-2 gap-3 text-sm">
          <div class="flex items-center gap-2 text-muted">
            <UIcon
              name="i-lucide-calendar"
              class="size-4"
            />
            <span>{{ formatDate(booking.performance.startsAt) }}</span>
          </div>

          <div class="flex items-center gap-2 text-muted">
            <UIcon
              name="i-lucide-clock"
              class="size-4"
            />
            <span>{{ formatTime(booking.performance.startsAt) }}</span>
          </div>

          <div class="flex items-center gap-2 text-muted">
            <UIcon
              name="i-lucide-map-pin"
              class="size-4"
            />
            <span>{{ booking.performance.venue.name }}</span>
          </div>

          <div
            v-if="booking.performance.doorsAt"
            class="flex items-center gap-2 text-muted"
          >
            <UIcon
              name="i-lucide-door-open"
              class="size-4"
            />
            <span>Doors {{ formatTime(booking.performance.doorsAt) }}</span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Tickets -->
    <UCard>
      <h3 class="font-semibold text-default mb-3">
        Tickets
      </h3>

      <div class="divide-y divide-default">
        <div
          v-for="item in getTicketSummary(booking.tickets)"
          :key="`${item.name}:${item.unitPrice}`"
          class="flex items-center justify-between py-2 first:pt-0 text-sm"
        >
          <span class="text-default">{{ item.count }}× {{ item.name }}</span>
          <span class="font-medium text-default">
            {{ formatPrice(item.unitPrice * item.count) }}
          </span>
        </div>
      </div>

      <USeparator class="my-3" />
      <div class="flex items-center justify-between">
        <span class="font-semibold text-default">Total</span>
        <span class="text-lg font-bold text-default">
          {{ formatPrice(getTotal(booking.tickets)) }}
        </span>
      </div>
    </UCard>

    <!-- Special requirements -->
    <UCard v-if="booking.customerNotes">
      <h3 class="font-semibold text-default mb-2">
        Special Requirements
      </h3>
      <p class="text-sm text-muted">
        {{ booking.customerNotes }}
      </p>
    </UCard>

    <!-- Important info -->
    <UAlert
      v-if="!isCancelled"
      title="Collect Your Tickets"
      description="Please arrive at the box office before the show starts to collect your tickets. Have your booking reference ready."
      icon="i-lucide-ticket"
      color="warning"
      variant="subtle"
    />

    <!-- Actions -->
    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <UButton
        label="Back to What's On"
        icon="i-lucide-arrow-left"
        variant="outline"
        color="neutral"
        to="/whats-on"
      />
      <UButton
        label="View Show"
        icon="i-lucide-theater"
        variant="subtle"
        :to="`/whats-on/${booking.performance.show.slug}`"
      />
    </div>
  </div>
</template>
