<script setup lang="ts">
import { saysSeason } from '#shared/utils/london'
import { ALL_VENUES, venueFilters, venueForFilter } from '#shared/utils/programme'
import type { ListedShow } from '#shared/utils/programme'

// Deliberately public: what is on is how somebody decides to come, and no account is needed
// (D-101). Every state on this page is computed by the server, never in the browser.
useSeoMeta({
  title: 'What\'s on',
  description: 'Every show on at the Nottingham New Theatre, when it runs and what a ticket costs.',
})

interface Listing { items: ListedShow[], total: number, page: number, pageSize: number, pages: number }

const page = ref(1)

// A filter value is never empty, or nothing is selected; "all" is the absent filter.
const venue = ref(ALL_VENUES)

// The venues with something on, read from the unfiltered load and then kept: filtering by one of
// them must not narrow the list of the others down to itself.
const venues = ref<string[]>([])
const wanted = computed(() => venueForFilter(venue.value, venues.value) ?? undefined)

const { data, status } = await useFetch<Listing>('/api/whats-on', {
  query: { page, venue: wanted },
  default: (): Listing => ({ items: [], total: 0, page: 1, pageSize: 25, pages: 1 }),
})

watchEffect(() => {
  if (wanted.value) return
  venues.value = [...new Set(data.value.items.flatMap(listed => listed.performances.map(one => one.venueName)))].sort()
})

const filters = computed(() => venueFilters(venues.value))

const season = saysSeason()

watch(venue, () => {
  page.value = 1
})

// The first card selling fast or already full carries the view's one sticker; the rest say their
// state in a badge, which is words and colour rather than colour alone (K-101).
const flagged = computed(() => data.value.items.find(listed =>
  listed.performances.some(one => !one.cancelled && (one.availability === 'LIMITED' || one.availability === 'SOLD_OUT')))?.show.slug ?? null)

function flagFor(listed: ListedShow): string {
  return listed.performances.some(one => !one.cancelled && one.availability === 'LIMITED') ? 'Selling fast' : 'House full'
}
</script>

<template>
  <div data-test="whats-on-page">
    <PhotoHero
      compact
      src="/images/banners/whats-on.webp"
      alt="A company taking a curtain call on the New Theatre stage"
    >
      <template #headline>
        <p class="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          Season {{ season }}
        </p>
      </template>
      <template #title>
        What's <span class="text-secondary">on</span>
      </template>
      <template #description>
        Everything here is written, directed, built and performed by students. Booking online
        holds your seats, and the box office takes payment at the theatre on the night.
      </template>
    </PhotoHero>

    <UContainer class="py-12">
      <div
        v-if="venues.length > 1"
        role="group"
        aria-label="Filter by venue"
        class="mb-8 flex flex-wrap gap-2"
        data-test="whats-on-venues"
      >
        <UButton
          v-for="filter in filters"
          :id="`venue-${filter.value}`"
          :key="filter.value"
          :label="filter.label"
          :color="venue === filter.value ? 'primary' : 'neutral'"
          :variant="venue === filter.value ? 'solid' : 'outline'"
          :aria-pressed="venue === filter.value"
          size="sm"
          class="rounded-full"
          @click="venue = filter.value"
        />
      </div>

      <p
        v-if="status !== 'pending' && data.items.length === 0"
        class="text-muted"
        data-test="whats-on-empty"
      >
        Nothing is on sale at the moment. The next season is announced here first.
      </p>

      <template v-else>
        <h2 class="sr-only">
          Shows on sale
        </h2>

        <UPageGrid>
          <ShowPosterCard
            v-for="listed in data.items"
            :key="listed.show.slug"
            :listed="listed"
          >
            <template
              v-if="listed.show.slug === flagged"
              #flag
            >
              <UBadge
                variant="sticker"
                size="sm"
              >
                {{ flagFor(listed) }}
              </UBadge>
            </template>
          </ShowPosterCard>
        </UPageGrid>
      </template>

      <div
        v-if="data.pages > 1"
        class="mt-10 flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="data.total"
          :items-per-page="data.pageSize"
        />
      </div>

      <UCard
        class="mt-12"
        data-test="whats-on-mailing-list"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="nnt-headline text-xl text-highlighted">
              Never miss a first night
            </h2>
            <p class="mt-1 text-sm text-muted">
              The theatre's mailing list carries what is opening next.
            </p>
          </div>
          <UButton
            to="/mailing-list"
            external
            variant="poster"
            label="Join the mailing list"
            class="shrink-0"
          />
        </div>
      </UCard>
    </UContainer>
  </div>
</template>
