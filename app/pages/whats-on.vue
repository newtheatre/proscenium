<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysPrice } from '#shared/utils/ticket-types'
import type { Availability, PublicPerformance, PublicShow } from '#shared/utils/programme'

// Deliberately public: what is on is how somebody decides to come, and no account is needed
// (D-101). Every state on this page is computed by the server, never in the browser.
useSeoMeta({
  title: 'What\'s on',
  description: 'Every show on at the Nottingham New Theatre, when it runs and what a ticket costs.',
})

interface Price { name: string, description: string | null, price: number }

interface Listed extends PublicPerformance {
  availability: Availability
  remaining: number | null
  says: string
  prices: Price[]
}

interface ListedShow {
  show: PublicShow
  categoryName: string | null
  performances: Listed[]
}

interface Listing { items: ListedShow[], total: number, page: number, pageSize: number, pages: number }

const page = ref(1)

const { data, status } = await useFetch<Listing>('/api/whats-on', {
  query: { page },
  default: (): Listing => ({ items: [], total: 0, page: 1, pageSize: 25, pages: 1 }),
})

// The Worker runs in UTC and a theatregoer reads a clock, so every date is pinned (0014).
const saysWhen = (at: number): string =>
  formatLondon(new Date(at * 1000), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const COLOURS: Record<Availability, 'success' | 'warning' | 'neutral'> = {
  AVAILABLE: 'success',
  LIMITED: 'warning',
  SOLD_OUT: 'neutral',
  BOOKING_CLOSED: 'neutral',
}

// The cheapest ticket on offer, which is what a listing quotes: the whole chain is on the show
// page (D-101 criterion 4).
function from(performance: Listed): string | null {
  const cheapest = performance.prices[0]
  return cheapest ? saysPrice(cheapest.price) : null
}
</script>

<template>
  <UContainer
    class="max-w-4xl py-16"
    data-test="whats-on-page"
  >
    <div class="space-y-3">
      <h1 class="nnt-headline text-4xl">
        What's on
      </h1>
      <p class="max-w-2xl text-lg text-muted">
        Everything here is written, directed, built and performed by students. Tickets are paid for
        at the theatre, so booking online holds your seats and the box office takes payment on the
        night.
      </p>
    </div>

    <p
      v-if="status !== 'pending' && data.items.length === 0"
      class="mt-10 text-muted"
      data-test="whats-on-empty"
    >
      Nothing is on sale at the moment. The next season is announced here first.
    </p>

    <div class="mt-10 space-y-8">
      <UCard
        v-for="listed in data.items"
        :key="listed.show.slug"
        :data-test="`show-${listed.show.slug}`"
      >
        <template #header>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 class="nnt-headline text-2xl">
                <ULink :to="`/shows/${listed.show.slug}`">
                  {{ listed.show.title }}
                </ULink>
              </h2>
              <p
                v-if="listed.show.subtitle"
                class="text-sm text-muted"
              >
                {{ listed.show.subtitle }}
              </p>
            </div>
            <UBadge
              v-if="listed.categoryName"
              color="neutral"
              variant="subtle"
            >
              {{ listed.categoryName }}
            </UBadge>
          </div>
        </template>

        <p
          v-if="listed.show.description"
          class="text-sm text-muted"
        >
          {{ listed.show.description }}
        </p>

        <ul class="mt-4 divide-y divide-default">
          <li
            v-for="performance in listed.performances"
            :key="performance.id"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
            :data-test="`performance-${performance.id}`"
          >
            <span class="font-medium">{{ saysWhen(performance.startsAt) }}</span>
            <span class="text-sm text-muted">{{ performance.venueName }}</span>
            <span
              v-if="performance.durationMinutes"
              class="text-sm text-muted"
            >
              {{ performance.durationMinutes }} minutes
            </span>
            <span
              v-if="from(performance)"
              class="text-sm text-muted"
            >
              From {{ from(performance) }}
            </span>

            <div class="ms-auto flex flex-wrap items-center gap-2">
              <UBadge
                v-if="performance.cancelled"
                color="error"
                variant="subtle"
                :data-test="`cancelled-${performance.id}`"
              >
                Cancelled
              </UBadge>
              <UBadge
                v-else
                :color="COLOURS[performance.availability]"
                variant="subtle"
                :data-test="`availability-${performance.id}`"
              >
                {{ performance.says }}
              </UBadge>

              <!-- An externally ticketed performance links out and offers no internal button:
                   the money is taken by whoever runs that box office (D-101 criterion 5). -->
              <UButton
                v-if="performance.externalBookingUrl && !performance.cancelled"
                :to="performance.externalBookingUrl"
                target="_blank"
                rel="noopener"
                size="sm"
                trailing-icon="i-lucide-external-link"
                :data-test="`external-${performance.id}`"
              >
                Book elsewhere
              </UButton>
              <UButton
                v-else-if="performance.availability === 'AVAILABLE' || performance.availability === 'LIMITED'"
                :to="`/shows/${listed.show.slug}`"
                size="sm"
                :data-test="`book-${performance.id}`"
              >
                Book
              </UButton>
              <!-- D-113 builds the waiting list; until then a sold-out house says where to ask. -->
              <span
                v-else-if="performance.availability === 'SOLD_OUT'"
                class="text-sm text-muted"
                :data-test="`waiting-${performance.id}`"
              >
                Ask the box office about returns
              </span>
            </div>
          </li>
        </ul>
      </UCard>
    </div>

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
</template>
