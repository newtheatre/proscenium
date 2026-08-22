<script setup lang="ts">
/**
 * Booking confirmation: reference, performance and ticket summary, plus the
 * link back to the booking.
 */
interface Ticket {
  id: string
  pricePaid: number
  /** Imported legacy tickets may have no recorded price: see formatTotal. */
  priceConfidence?: 'EXACT' | 'DERIVED' | 'UNKNOWN'
  /** Set once the box office has refunded this specific ticket. */
  refundedAt?: string | Date | null
  ticketType: { id: string, name: string }
}

/**
 * Refunded tickets are returned by the query but are no longer held or owed,
 * so they must not be counted.
 */
function active(tickets: Ticket[]): Ticket[] {
  return tickets.filter(t => !t.refundedAt)
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
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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

function formatPrice(pence: number): string {
  if (pence === 0) return 'Free'
  return `£${(pence / 100).toFixed(2)}`
}

function getTicketSummary(allTickets: Ticket[]) {
  const tickets = active(allTickets)
  // Group by type AND price paid, so a type sold at two prices shows one line per
  // price and the lines sum to the total.
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
  return active(tickets).reduce((sum, t) => sum + t.pricePaid, 0)
}

/**
 * An imported booking can carry priceConfidence UNKNOWN with pricePaid 0, so
 * the total is shown as unrecorded rather than as £0.
 */
function formatTotal(allTickets: Ticket[]): string {
  const tickets = active(allTickets)
  if (tickets.length > 0 && tickets.every(t => t.priceConfidence === 'UNKNOWN')) {
    return 'Price not recorded'
  }
  const total = getTotal(tickets)
  if (tickets.some(t => t.priceConfidence === 'UNKNOWN')) {
    return `${formatPrice(total)} (some prices not recorded)`
  }
  return formatPrice(total)
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
          {{ formatTotal(booking.tickets) }}
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
