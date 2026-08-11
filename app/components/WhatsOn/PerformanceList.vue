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

const props = defineProps<{
  performances: Performance[]
  showSlug: string
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

function formatDuration(minutes: number, intervalCount: number, intervalMinutes: number | null) {
  const parts: string[] = []
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0) parts.push(`${mins}m`)

  let result = parts.join(' ')
  if (intervalCount > 0 && intervalMinutes) {
    result += ` (incl. ${intervalCount} interval${intervalCount > 1 ? 's' : ''})`
  }
  return result
}

function getAvailabilityInfo(perf: Performance) {
  if (perf.isSoldOut) return { label: 'Sold Out', color: 'error' as const, icon: 'i-lucide-x-circle' }
  if (perf.capacity === null) return { label: 'Available', color: 'success' as const, icon: 'i-lucide-check-circle' }

  const remaining = perf.capacity - perf.ticketsSold
  const percentage = (remaining / perf.capacity) * 100

  if (percentage <= 10) return { label: `${remaining} left`, color: 'error' as const, icon: 'i-lucide-alert-circle' }
  if (percentage <= 25) return { label: 'Limited', color: 'warning' as const, icon: 'i-lucide-alert-triangle' }
  return { label: 'Available', color: 'success' as const, icon: 'i-lucide-check-circle' }
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
    <div
      v-for="group in groupedPerformances"
      :key="group.date"
      class="space-y-3"
    >
      <h3 class="text-sm font-semibold text-muted uppercase tracking-wider">
        {{ group.date }}
      </h3>

      <div class="space-y-2">
        <WhatsOnPerformanceCard
          v-for="perf in group.performances"
          :key="perf.id"
          :performance="perf"
          :availability="getAvailabilityInfo(perf)"
          @select="emit('select', perf.id)"
        >
          <template #duration>
            <span v-if="perf.durationMinutes">
              {{ formatDuration(perf.durationMinutes, perf.intervalCount, perf.intervalMinutes) }}
            </span>
          </template>
          <template #time>
            {{ formatTime(perf.startsAt) }}
          </template>
          <template #doors>
            <span v-if="perf.doorsAt">
              Doors {{ formatTime(perf.doorsAt) }}
            </span>
          </template>
        </WhatsOnPerformanceCard>
      </div>
    </div>

    <UEmpty
      v-if="performances.length === 0"
      icon="i-lucide-calendar-off"
      title="No upcoming performances"
      description="Check back later for new dates."
    />
  </div>
</template>
