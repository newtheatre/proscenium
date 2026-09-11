<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysPrice } from '#shared/utils/ticket-types'
import type { Availability, ListedPerformance, ListedShow } from '#shared/utils/programme'

// One show as a printed poster: the listing's card, on the home page and on what's on. The
// artwork and its absence are PosterFrame's job, so a real poster lands in one component.
const props = defineProps<{ listed: ListedShow }>()

const COLOURS: Record<Availability, 'success' | 'warning' | 'neutral'> = {
  AVAILABLE: 'success',
  LIMITED: 'warning',
  SOLD_OUT: 'neutral',
  BOOKING_CLOSED: 'neutral',
}

const onOffer = computed(() => props.listed.performances.filter(one => !one.cancelled))

// The night a visitor is sent to: the first still bookable here, which is what the button means.
const bookable = computed(() => onOffer.value.find(one =>
  !one.externalBookingUrl && (one.availability === 'AVAILABLE' || one.availability === 'LIMITED')) ?? null)

const elsewhere = computed(() => onOffer.value.find(one => one.externalBookingUrl) ?? null)
const soldOut = computed(() => onOffer.value.find(one => one.availability === 'SOLD_OUT') ?? null)

const speaks = computed<ListedPerformance | null>(() => bookable.value ?? soldOut.value ?? onOffer.value[0] ?? null)

const day = (at: number): string =>
  formatLondon(new Date(at * 1000), { weekday: 'short', day: 'numeric', month: 'short' })

// The run as one line: one night says itself, a run says its first and its last (D-101).
const runs = computed(() => {
  const times = onOffer.value.map(one => one.startsAt).sort((a, b) => a - b)
  const first = times[0]
  const last = times[times.length - 1]
  if (first === undefined || last === undefined) return null
  return first === last ? day(first) : `${day(first)} to ${day(last)}`
})

const venue = computed(() => {
  const names = [...new Set(onOffer.value.map(one => one.venueName))]
  return names.length === 1 ? names[0]! : null
})

// The cheapest seat anywhere in the run, which is what a listing quotes; the whole chain is on
// the show page (D-101 criterion 4).
const from = computed(() => {
  const prices = onOffer.value.flatMap(one => one.prices.map(price => price.price)).sort((a, b) => a - b)
  return prices[0] === undefined ? null : saysPrice(prices[0])
})
</script>

<template>
  <UCard
    as="article"
    variant="poster"
    :ui="{ header: 'p-0 sm:p-0', body: 'p-4 sm:p-4', footer: 'p-4 sm:p-4' }"
    :data-test="`show-${listed.show.slug}`"
  >
    <template #header>
      <div class="relative">
        <PosterFrame
          :title="listed.show.title"
          :poster-url="listed.show.posterUrl"
        />
        <div
          v-if="$slots.flag"
          class="absolute end-3 top-3"
        >
          <slot name="flag" />
        </div>
      </div>
    </template>

    <h3 class="nnt-headline text-xl">
      <ULink
        :to="`/shows/${listed.show.slug}`"
        class="hover:text-primary"
      >
        {{ listed.show.title }}
      </ULink>
    </h3>

    <p class="mt-1 font-mono text-sm text-muted">
      <span v-if="runs">{{ runs }}</span>
      <span v-if="runs && venue"> · </span>
      <span v-if="venue">{{ venue }}</span>
    </p>

    <p
      v-if="listed.show.description"
      class="mt-2 line-clamp-2 text-sm"
    >
      {{ listed.show.description }}
    </p>

    <UBadge
      v-if="speaks"
      class="mt-3"
      :color="COLOURS[speaks.availability]"
      variant="subtle"
      size="sm"
      :data-test="`availability-${listed.show.slug}`"
    >
      {{ elsewhere && !bookable ? 'Tickets sold elsewhere' : speaks.says }}
    </UBadge>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span
          v-if="from"
          class="font-mono text-sm"
        >From {{ from }}</span>
        <span v-else />

        <UButton
          v-if="bookable"
          :to="`/book/${bookable.id}`"
          :data-test="`book-${listed.show.slug}`"
        >
          Book
        </UButton>
        <UButton
          v-else-if="elsewhere"
          :to="elsewhere.externalBookingUrl!"
          target="_blank"
          rel="noopener"
          trailing-icon="i-lucide-external-link"
          :data-test="`external-${listed.show.slug}`"
        >
          Book elsewhere
        </UButton>
        <UButton
          v-else-if="soldOut"
          :to="`/waiting-list/${soldOut.id}`"
          variant="subtle"
          :data-test="`waiting-${listed.show.slug}`"
        >
          Join the waiting list
        </UButton>
        <UButton
          v-else
          :to="`/shows/${listed.show.slug}`"
          variant="subtle"
        >
          See the show
        </UButton>
      </div>
    </template>
  </UCard>
</template>
