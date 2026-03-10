<script setup lang="ts">
interface Performance {
  id: string
  startsAt: string | Date
  venue: { id: string, name: string, capacity: number | null }
  ticketsSold: number
  capacity: number | null
}

interface Show {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  posterUrl: string | null
  performances: Performance[]
}

const props = defineProps<{
  show: Show
}>()

const nextPerformance = computed(() => props.show.performances[0])

const performanceDateRange = computed(() => {
  const perfs = props.show.performances
  if (perfs.length === 0) return ''
  const first = new Date(perfs[0]!.startsAt)
  const last = new Date(perfs[perfs.length - 1]!.startsAt)

  const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  if (first.toDateString() === last.toDateString()) {
    return formatDate(first)
  }
  return `${formatDate(first)} – ${formatDate(last)}`
})

const venues = computed(() => {
  const venueNames = new Set(props.show.performances.map(p => p.venue.name))
  return Array.from(venueNames).join(', ')
})

const availabilityByPerformance = computed(() => {
  return props.show.performances
    .filter(perf => perf.capacity !== null)
    .map(perf => ({
      remaining: perf.capacity! - perf.ticketsSold,
    }))
})

const isFullySoldOut = computed(() => {
  if (availabilityByPerformance.value.length === 0) return false
  return availabilityByPerformance.value.every(perf => perf.remaining <= 0)
})

const hasAnySoldOutPerformances = computed(() => {
  if (availabilityByPerformance.value.length === 0) return false
  return availabilityByPerformance.value.some(perf => perf.remaining <= 0)
})

const hasAnyAvailablePerformances = computed(() => {
  if (availabilityByPerformance.value.length === 0) return false
  return availabilityByPerformance.value.some(perf => perf.remaining > 0)
})

const hasLimitedAvailability = computed(() => {
  if (availabilityByPerformance.value.length === 0) return false
  return availabilityByPerformance.value.some(perf => perf.remaining > 0 && perf.remaining <= 10)
})

const availabilityLabel = computed(() => {
  if (isFullySoldOut.value) return 'Sold Out'
  if (hasLimitedAvailability.value) return 'Limited Availability'
  if (hasAnySoldOutPerformances.value && hasAnyAvailablePerformances.value) return 'Some Performances Sold Out'
  return null
})

const availabilityColor = computed(() => {
  if (!availabilityLabel.value) return undefined
  if (availabilityLabel.value === 'Sold Out') return 'error' as const
  return 'warning' as const
})
</script>

<template>
  <NuxtLink
    :to="`/whats-on/${show.slug}`"
    class="group block"
  >
    <UCard
      class="h-full transition-shadow duration-200 group-hover:shadow-lg"
      :ui="{ body: 'p-0' }"
    >
      <template #header>
        <div class="aspect-3/4 overflow-hidden bg-elevated relative">
          <NuxtImg
            v-if="show.posterUrl"
            :src="`/images/${show.posterUrl}`"
            :alt="show.title"
            class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            width="400"
            height="533"
          />
          <div
            v-else
            class="flex h-full w-full items-center justify-center"
          >
            <UIcon
              name="i-lucide-theater"
              class="size-16 text-muted"
            />
          </div>

          <UBadge
            v-if="availabilityLabel"
            :color="availabilityColor"
            :label="availabilityLabel"
            class="absolute top-3 right-3"
          />
        </div>
      </template>

      <div class="p-4 space-y-2">
        <h3 class="text-lg font-semibold text-default group-hover:text-primary transition-colors">
          {{ show.title }}
        </h3>

        <p
          v-if="show.subtitle"
          class="text-sm text-muted"
        >
          {{ show.subtitle }}
        </p>

        <div class="flex flex-col gap-1.5 text-sm text-muted">
          <div class="flex items-center gap-1.5">
            <UIcon
              name="i-lucide-calendar"
              class="size-4 shrink-0"
            />
            <span>{{ performanceDateRange }}</span>
          </div>

          <div class="flex items-center gap-1.5">
            <UIcon
              name="i-lucide-map-pin"
              class="size-4 shrink-0"
            />
            <span>{{ venues }}</span>
          </div>

          <div
            v-if="nextPerformance"
            class="flex items-center gap-1.5"
          >
            <UIcon
              name="i-lucide-clock"
              class="size-4 shrink-0"
            />
            <span>{{ show.performances.length }} performance{{ show.performances.length !== 1 ? 's' : '' }}</span>
          </div>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
