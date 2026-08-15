<script setup lang="ts">
/**
 * Performance selection step, grouped by date with availability.
 */
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
  isBookingClosed?: boolean
  ticketTypes: Array<{
    id: string
    name: string
    effectivePrice: number
  }>
}

const props = defineProps<{
  performances: Performance[]
  selectedPerformanceId: string | null
}>()

const emit = defineEmits<{
  select: [performanceId: string]
}>()

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getAvailability(perf: Performance) {
  if (perf.isSoldOut) return { label: 'Sold Out', color: 'error' as const }
  if (perf.capacity === null) return { label: 'Available', color: 'success' as const }

  const remaining = perf.capacity - perf.ticketsSold
  const percentage = (remaining / perf.capacity) * 100

  if (percentage <= 10) return { label: `${remaining} left`, color: 'error' as const }
  if (percentage <= 25) return { label: 'Limited', color: 'warning' as const }
  return { label: 'Available', color: 'success' as const }
}

// Group performances by date
const groupedPerformances = computed(() => {
  const groups = new Map<string, Performance[]>()
  for (const perf of props.performances) {
    const dateKey = new Date(perf.startsAt).toDateString()
    if (!groups.has(dateKey)) groups.set(dateKey, [])
    groups.get(dateKey)!.push(perf)
  }
  return Array.from(groups.entries()).map(([, perfs]) => ({
    date: formatDate(perfs[0]!.startsAt),
    performances: perfs,
  }))
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-lg font-semibold text-default">
        Select a Performance
      </h3>
      <p class="text-sm text-muted mt-1">
        Choose the date and time you'd like to attend.
      </p>
    </div>

    <div
      v-for="group in groupedPerformances"
      :key="group.date"
      class="space-y-2"
    >
      <h4 class="text-sm font-medium text-muted uppercase tracking-wider">
        {{ group.date }}
      </h4>

      <div class="grid gap-2">
        <button
          v-for="perf in group.performances"
          :key="perf.id"
          :disabled="perf.isSoldOut || perf.isBookingClosed"
          :aria-pressed="perf.id === selectedPerformanceId"
          class="w-full text-left rounded-lg border-2 p-4 transition-all duration-150"
          :class="[
            perf.id === selectedPerformanceId
              ? 'border-primary bg-primary/5'
              : 'border-default hover:border-muted',
            perf.isSoldOut || perf.isBookingClosed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          ]"
          @click="!perf.isSoldOut && !perf.isBookingClosed && emit('select', perf.id)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="text-lg font-bold text-default tabular-nums">
                {{ formatTime(perf.startsAt) }}
              </div>
              <USeparator
                orientation="vertical"
                class="h-6"
              />
              <div class="text-sm text-muted">
                <div class="flex items-center gap-1">
                  <UIcon
                    name="i-lucide-map-pin"
                    class="size-3.5"
                  />
                  {{ perf.venue.name }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <UBadge
                :label="getAvailability(perf).label"
                :color="getAvailability(perf).color"
                variant="subtle"
                size="sm"
              />
              <UIcon
                v-if="perf.id === selectedPerformanceId"
                name="i-lucide-check-circle"
                class="size-5 text-primary"
              />
            </div>
          </div>
        </button>
      </div>
    </div>

    <UEmpty
      v-if="performances.length === 0"
      icon="i-lucide-calendar-off"
      title="No performances available"
      description="There are no performances currently available to book."
    />
  </div>
</template>
