<script setup lang="ts">
/**
 * Ticket selection step: quantities, running total, capacity limit.
 */
interface TicketType {
  id: string
  name: string
  description: string | null
  effectivePrice: number
}

interface TicketSelection {
  ticketTypeId: string
  quantity: number
}

const props = defineProps<{
  ticketTypes: TicketType[]
  modelValue: TicketSelection[]
  maxTickets?: number
  remainingCapacity: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [tickets: TicketSelection[]]
}>()

const MAX_PER_TYPE = 10

function getQuantity(ticketTypeId: string): number {
  return props.modelValue.find(t => t.ticketTypeId === ticketTypeId)?.quantity ?? 0
}

function setQuantity(ticketTypeId: string, quantity: number) {
  const updated = props.modelValue.filter(t => t.ticketTypeId !== ticketTypeId)
  if (quantity > 0) {
    updated.push({ ticketTypeId, quantity })
  }
  emit('update:modelValue', updated)
}

const totalTickets = computed(() => {
  return props.modelValue.reduce((sum, t) => sum + t.quantity, 0)
})

const totalPrice = computed(() => {
  return props.modelValue.reduce((sum, t) => {
    const type = props.ticketTypes.find(tt => tt.id === t.ticketTypeId)
    return sum + (type?.effectivePrice ?? 0) * t.quantity
  }, 0)
})

const effectiveMax = computed(() => {
  return props.remainingCapacity ?? props.maxTickets ?? 50
})

function canIncrement(ticketTypeId: string): boolean {
  const current = getQuantity(ticketTypeId)
  if (current >= MAX_PER_TYPE) return false
  if (totalTickets.value >= effectiveMax.value) return false
  return true
}

function formatPrice(pence: number): string {
  if (pence === 0) return 'Free'
  return `£${(pence / 100).toFixed(2)}`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-lg font-semibold text-default">
        Select Tickets
      </h3>
      <p class="text-sm text-muted mt-1">
        Choose the number and type of tickets you'd like.
      </p>
    </div>

    <!-- Capacity warning -->
    <UAlert
      v-if="remainingCapacity !== null && remainingCapacity <= 20"
      :title="`Only ${remainingCapacity} ticket${remainingCapacity !== 1 ? 's' : ''} remaining`"
      icon="i-lucide-alert-triangle"
      color="warning"
      variant="subtle"
    />

    <!-- Ticket type rows -->
    <div class="divide-y divide-default">
      <div
        v-for="type in ticketTypes"
        :key="type.id"
        class="flex items-center justify-between py-4 first:pt-0 last:pb-0"
      >
        <div class="flex-1 min-w-0">
          <div class="font-medium text-default">
            {{ type.name }}
          </div>
          <div
            v-if="type.description"
            class="text-sm text-muted mt-0.5"
          >
            {{ type.description }}
          </div>
          <div class="text-sm font-medium text-primary mt-0.5">
            {{ formatPrice(type.effectivePrice) }}
          </div>
        </div>

        <div class="flex items-center gap-2 ml-4">
          <UButton
            icon="i-lucide-minus"
            variant="outline"
            color="neutral"
            size="sm"
            :disabled="getQuantity(type.id) === 0"
            :aria-label="`Decrease ${type.name} tickets`"
            @click="setQuantity(type.id, getQuantity(type.id) - 1)"
          />
          <span
            class="w-8 text-center text-sm font-medium tabular-nums text-default"
            role="status"
            aria-live="polite"
            :aria-label="`${type.name} quantity`"
          >
            {{ getQuantity(type.id) }}
          </span>
          <UButton
            icon="i-lucide-plus"
            variant="outline"
            color="neutral"
            size="sm"
            :disabled="!canIncrement(type.id)"
            :aria-label="`Increase ${type.name} tickets`"
            @click="setQuantity(type.id, getQuantity(type.id) + 1)"
          />
        </div>
      </div>
    </div>

    <!-- Total -->
    <USeparator />
    <div class="flex items-center justify-between">
      <div>
        <span class="text-sm text-muted">Total</span>
        <span class="text-sm text-muted ml-1">
          ({{ totalTickets }} ticket{{ totalTickets !== 1 ? 's' : '' }})
        </span>
      </div>
      <span class="text-lg font-bold text-default">
        {{ formatPrice(totalPrice) }}
      </span>
    </div>
  </div>
</template>
