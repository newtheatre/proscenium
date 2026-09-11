<script setup lang="ts">
import type { ListedShow } from '#shared/utils/programme'

// Deliberately public: what is on is how somebody decides to come, and no account is needed
// (D-101). Every state on this page is computed by the server, never in the browser.
useSeoMeta({
  title: 'What\'s on',
  description: 'Every show on at the Nottingham New Theatre, when it runs and what a ticket costs.',
})

interface Listing { items: ListedShow[], total: number, page: number, pageSize: number, pages: number }

const page = ref(1)

// A tab value is never empty, or the tab strip has nothing to select; "all" is the absent filter.
const venue = ref('all')
const wanted = computed(() => (venue.value === 'all' ? undefined : venue.value))

const { data, status } = await useFetch<Listing>('/api/whats-on', {
  query: { page, venue: wanted },
  default: (): Listing => ({ items: [], total: 0, page: 1, pageSize: 25, pages: 1 }),
})

// The venues with something on, read from the unfiltered load and then kept: filtering by one of
// them must not narrow the list of the others down to itself.
const venues = ref<string[]>([])
watchEffect(() => {
  if (wanted.value) return
  venues.value = [...new Set(data.value.items.flatMap(listed => listed.performances.map(one => one.venueName)))].sort()
})

const tabs = computed(() => [
  { label: 'All', value: 'all' },
  ...venues.value.map(name => ({ label: name, value: name })),
])

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
      src="/images/banners/whats-on.webp"
      alt="A company taking a curtain call on the New Theatre stage"
      title="What's on"
      description="Everything here is written, directed, built and performed by students. Tickets are paid for at the theatre, so booking online holds your seats and the box office takes payment on the night."
    />

    <UContainer class="py-12">
      <UTabs
        v-if="venues.length > 1"
        v-model="venue"
        variant="link"
        :content="false"
        :items="tabs"
        class="mb-8 overflow-x-auto"
        data-test="whats-on-venues"
      />

      <p
        v-if="status !== 'pending' && data.items.length === 0"
        class="text-muted"
        data-test="whats-on-empty"
      >
        Nothing is on sale at the moment. The next season is announced here first.
      </p>

      <UPageGrid v-else>
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
    </UContainer>
  </div>
</template>
