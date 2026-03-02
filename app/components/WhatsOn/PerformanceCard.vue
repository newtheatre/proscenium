<script setup lang="ts">
interface Venue {
  id: string
  name: string
  address?: string | null
  capacity: number | null
}

interface Performance {
  id: string
  startsAt: string | Date
  doorsAt: string | Date | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  venue: Venue
  ticketsSold: number
  capacity: number | null
  isSoldOut: boolean
}

defineProps<{
  performance: Performance
  availability: {
    label: string
    color: 'success' | 'warning' | 'error'
    icon: string
  }
}>()

const emit = defineEmits<{
  select: []
}>()
</script>

<template>
  <UCard
    :ui="{ body: 'p-4' }"
    class="transition-colors"
    :class="{ 'opacity-60': performance.isSoldOut }"
  >
    <div class="flex items-center justify-between gap-4">
      <!-- Time & Venue -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3">
          <div class="text-xl font-bold text-default tabular-nums">
            <slot name="time" />
          </div>
          <UBadge
            :label="availability.label"
            :color="availability.color"
            variant="subtle"
            size="sm"
          />
        </div>

        <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <div class="flex items-center gap-1">
            <UIcon
              name="i-lucide-map-pin"
              class="size-3.5"
            />
            <span>{{ performance.venue.name }}</span>
          </div>

          <div
            v-if="$slots.doors"
            class="flex items-center gap-1"
          >
            <UIcon
              name="i-lucide-door-open"
              class="size-3.5"
            />
            <slot name="doors" />
          </div>

          <div
            v-if="$slots.duration"
            class="flex items-center gap-1"
          >
            <UIcon
              name="i-lucide-clock"
              class="size-3.5"
            />
            <slot name="duration" />
          </div>
        </div>
      </div>

      <!-- Book button -->
      <UButton
        :disabled="performance.isSoldOut"
        :label="performance.isSoldOut ? 'Sold Out' : 'Book Now'"
        :color="performance.isSoldOut ? 'neutral' : 'primary'"
        :variant="performance.isSoldOut ? 'outline' : 'solid'"
        icon="i-lucide-ticket"
        @click="emit('select')"
      />
    </div>
  </UCard>
</template>
