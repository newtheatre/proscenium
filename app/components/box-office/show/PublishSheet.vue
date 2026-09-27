<script setup lang="ts">
import { runningTimeLine } from '#shared/utils/night-hub'
import { saysPrice } from '#shared/utils/ticket-types'
import { saysWhen } from '#shared/utils/when'
import type { CoveringPass } from '#shared/utils/pass-types'
import type { AdminPerformance, AdminShow, ShowVenue } from '#shared/utils/programme'

// Read back before a show goes on sale: each night's venue, running time and shifts, then what a
// booker pays, the passes, the warnings and the poster. It gates nothing (D-132 criterion 7).

const props = defineProps<{
  detail: { show: AdminShow, performances: AdminPerformance[], venues: ShowVenue[], coveringPasses: CoveringPass[] } | null | undefined
}>()

const cascade = defineModel<boolean>('cascade', { required: true })
const cover = defineModel<string[]>('cover', { required: true })

interface PriceLine { ticketTypeId: string, name: string, price: number, active: boolean, archived: boolean, accessKind: string | null }

const prices = ref<PriceLine[] | null>(null)

// An access seat is never bought on its own; the route already leaves out pass admission (0074).
const offered = computed(() => (prices.value ?? [])
  .filter(one => one.active && !one.archived && one.accessKind === null))

onMounted(async () => {
  if (!props.detail) return
  try {
    prices.value = (await $fetch<{ items: PriceLine[] }>(`/api/admin/shows/${props.detail.show.id}/prices`)).items
  }
  catch {
    prices.value = []
  }
})

const nights = computed(() => (props.detail?.performances ?? []).filter(one => one.status !== 'CANCELLED'))

function saysShifts(one: AdminPerformance): string {
  if (props.detail?.venues.find(venue => venue.id === one.venueId)?.isExternal) return 'external: shifts added by hand'
  return one.shiftCount === 0 ? 'No shifts stamped' : `${plural(one.shiftCount, 'shift')} stamped`
}

const saysWarnings = computed(() => {
  const show = props.detail?.show
  if (!show) return ''
  if (show.warningCount > 0) return plural(show.warningCount, 'content warning')
  return show.warningsConfirmedNone ? 'Assessed: nothing to warn about' : 'Not yet assessed'
})
</script>

<template>
  <div
    class="space-y-5"
    data-test="publish-sheet"
  >
    <USwitch
      v-model="cascade"
      label="Put its performances on sale too"
      description="Cancelled performances are left alone."
      data-test="cascade"
    />

    <section class="space-y-2">
      <p class="text-sm font-medium">
        Nights
      </p>
      <p
        v-if="nights.length === 0"
        class="text-sm text-muted"
      >
        No performances yet.
      </p>
      <ul
        v-else
        class="space-y-1 text-sm"
      >
        <li
          v-for="one in nights"
          :key="one.id"
          :data-test="`publish-night-${one.id}`"
        >
          <span class="font-medium">{{ saysWhen(one.startsAt) }}</span>
          <span class="text-muted"> · {{ one.venueName }} · {{ runningTimeLine(one.durationMinutes, one.intervalCount, one.intervalMinutes) }} · {{ saysShifts(one) }}</span>
        </li>
      </ul>
    </section>

    <section
      class="space-y-1"
      data-test="publish-prices"
    >
      <p class="text-sm font-medium">
        Prices
      </p>
      <p class="text-sm text-muted">
        {{ prices === null
          ? 'Reading the prices'
          : offered.length === 0
            ? 'No ticket type is on sale for this show.'
            : offered.map(one => `${one.name} ${saysPrice(one.price)}`).join(' · ') }}
      </p>
    </section>

    <BoxOfficeShowPublishPasses
      v-model="cover"
      :detail="detail"
    />

    <section class="grid gap-3 sm:grid-cols-2">
      <div data-test="publish-warnings">
        <p class="text-sm font-medium">
          Content warnings
        </p>
        <p class="text-sm text-muted">
          {{ saysWarnings }}
        </p>
      </div>
      <div data-test="publish-poster">
        <p class="text-sm font-medium">
          Poster
        </p>
        <p class="text-sm text-muted">
          {{ detail?.show.posterUrl ? 'Uploaded' : 'No poster: the show uses its own gradient until one is uploaded' }}
        </p>
      </div>
    </section>
  </div>
</template>
