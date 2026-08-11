<script setup lang="ts">
/**
 * Booking summary / review step.
 *
 * Shows all selected options with a final confirmation.
 */
interface TicketType {
  id: string
  name: string
  effectivePrice: number
}

interface Venue {
  id: string
  name: string
  address?: string | null
}

interface Performance {
  id: string
  startsAt: string | Date
  doorsAt: string | Date | null
  durationMinutes: number | null
  venue: Venue
}

interface TicketSelection {
  ticketTypeId: string
  quantity: number
}

const props = defineProps<{
  showTitle: string
  performance: Performance
  tickets: TicketSelection[]
  ticketTypes: TicketType[]
  customerName: string
  customerEmail: string
  customerNotes: string
  isSubmitting: boolean
}>()

const emit = defineEmits<{
  'confirm': []
  'edit:performance': []
  'edit:tickets': []
  'edit:details': []
}>()

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

const ticketSummary = computed(() => {
  return props.tickets
    .map((t) => {
      const type = props.ticketTypes.find(tt => tt.id === t.ticketTypeId)
      if (!type) return null
      return {
        name: type.name,
        quantity: t.quantity,
        unitPrice: type.effectivePrice,
        lineTotal: type.effectivePrice * t.quantity,
      }
    })
    .filter(Boolean) as Array<{
    name: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
})

const totalPrice = computed(() => {
  return ticketSummary.value.reduce((sum, t) => sum + t.lineTotal, 0)
})

const totalTickets = computed(() => {
  return ticketSummary.value.reduce((sum, t) => sum + t.quantity, 0)
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-lg font-semibold text-default">
        Review Your Booking
      </h3>
      <p class="text-sm text-muted mt-1">
        Please check the details below before confirming.
      </p>
    </div>

    <!-- Show & Performance -->
    <UCard>
      <div class="flex items-start justify-between">
        <div class="space-y-1">
          <h4 class="font-semibold text-default">
            {{ showTitle }}
          </h4>
          <div class="flex items-center gap-1.5 text-sm text-muted">
            <UIcon
              name="i-lucide-calendar"
              class="size-4"
            />
            <span>{{ formatDate(performance.startsAt) }} at {{ formatTime(performance.startsAt) }}</span>
          </div>
          <div class="flex items-center gap-1.5 text-sm text-muted">
            <UIcon
              name="i-lucide-map-pin"
              class="size-4"
            />
            <span>{{ performance.venue.name }}</span>
          </div>
          <div
            v-if="performance.doorsAt"
            class="flex items-center gap-1.5 text-sm text-muted"
          >
            <UIcon
              name="i-lucide-door-open"
              class="size-4"
            />
            <span>Doors open at {{ formatTime(performance.doorsAt) }}</span>
          </div>
        </div>
        <UButton
          icon="i-lucide-pencil"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Change performance"
          @click="emit('edit:performance')"
        />
      </div>
    </UCard>

    <!-- Tickets -->
    <UCard>
      <div class="flex items-start justify-between mb-3">
        <h4 class="font-semibold text-default">
          Tickets
        </h4>
        <UButton
          icon="i-lucide-pencil"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Change tickets"
          @click="emit('edit:tickets')"
        />
      </div>

      <div class="divide-y divide-default">
        <div
          v-for="ticket in ticketSummary"
          :key="ticket.name"
          class="flex items-center justify-between py-2 first:pt-0"
        >
          <div>
            <span class="text-default">{{ ticket.quantity }}× {{ ticket.name }}</span>
            <span class="text-sm text-muted ml-1">
              @ {{ formatPrice(ticket.unitPrice) }}
            </span>
          </div>
          <span class="font-medium text-default">
            {{ formatPrice(ticket.lineTotal) }}
          </span>
        </div>
      </div>

      <USeparator class="my-3" />
      <div class="flex items-center justify-between">
        <span class="font-semibold text-default">
          Total ({{ totalTickets }} ticket{{ totalTickets !== 1 ? 's' : '' }})
        </span>
        <span class="text-lg font-bold text-default">
          {{ formatPrice(totalPrice) }}
        </span>
      </div>
    </UCard>

    <!-- Customer Details -->
    <UCard>
      <div class="flex items-start justify-between mb-3">
        <h4 class="font-semibold text-default">
          Your Details
        </h4>
        <UButton
          icon="i-lucide-pencil"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Change details"
          @click="emit('edit:details')"
        />
      </div>

      <div class="space-y-1 text-sm">
        <div class="flex items-center gap-1.5 text-muted">
          <UIcon
            name="i-lucide-user"
            class="size-4"
          />
          <span class="text-default">{{ customerName }}</span>
        </div>
        <div class="flex items-center gap-1.5 text-muted">
          <UIcon
            name="i-lucide-mail"
            class="size-4"
          />
          <span class="text-default">{{ customerEmail }}</span>
        </div>
        <div
          v-if="customerNotes"
          class="flex items-start gap-1.5 text-muted mt-2"
        >
          <UIcon
            name="i-lucide-message-square"
            class="size-4 mt-0.5"
          />
          <span class="text-default">{{ customerNotes }}</span>
        </div>
      </div>
    </UCard>

    <!-- Payment notice -->
    <UAlert
      title="Pay at the Box Office"
      description="This is a free reservation. Payment is collected when you arrive to pick up your tickets at the box office before the show."
      icon="i-lucide-info"
      color="info"
      variant="subtle"
    />

    <!-- Confirm button -->
    <UButton
      label="Confirm Booking"
      icon="i-lucide-check"
      size="lg"
      block
      :loading="isSubmitting"
      @click="emit('confirm')"
    />
  </div>
</template>
