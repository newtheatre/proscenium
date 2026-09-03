<script setup lang="ts">
import { saysAssessment, saysWarningLevel } from '#shared/utils/content-warnings'
import { formatLondon } from '#shared/utils/london'
import { saysLatecomerPolicy } from '#shared/utils/programme'
import { saysPrice } from '#shared/utils/ticket-types'
import type { PublicContentWarning, WarningAssessment } from '#shared/utils/content-warnings'
import type { Availability, PublicPerformance, PublicShow } from '#shared/utils/programme'

// Deliberately public: one show, its warnings and the practical details somebody needs before they
// decide (D-101, D-102). A draft show has no page here at all, which is a 404 and not a thin one.

interface Price { name: string, description: string | null, price: number }

interface Listed extends PublicPerformance {
  availability: Availability
  remaining: number | null
  says: string
  prices: Price[]
}

interface Detail {
  show: PublicShow
  categoryName: string | null
  assessment: WarningAssessment
  warnings: PublicContentWarning[]
  performances: Listed[]
}

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data } = await useFetch<Detail>(() => `/api/shows/${slug.value}`)

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: 'No such show', fatal: true })
}

const show = computed(() => data.value!.show)

useSeoMeta({
  title: () => show.value.title,
  description: () => show.value.description ?? `${show.value.title} at the Nottingham New Theatre.`,
})

const saysWhen = (at: number): string =>
  formatLondon(new Date(at * 1000), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const COLOURS: Record<Availability, 'success' | 'warning' | 'neutral'> = {
  AVAILABLE: 'success',
  LIMITED: 'warning',
  SOLD_OUT: 'neutral',
  BOOKING_CLOSED: 'neutral',
}

// Every performance of one show may differ in running time, so the practical details come from the
// first one actually on offer: a cancelled first night would otherwise describe the whole run.
const shape = computed(() => {
  const performances = data.value?.performances ?? []
  return performances.find(one => !one.cancelled) ?? performances[0] ?? null
})

function saysInterval(performance: Listed): string {
  if (performance.intervalCount === 0) return 'Straight through, with no interval'
  const each = performance.intervalMinutes ? ` of ${performance.intervalMinutes} minutes` : ''
  return performance.intervalCount === 1 ? `One interval${each}` : `${performance.intervalCount} intervals${each}`
}
</script>

<template>
  <UContainer
    v-if="data"
    class="max-w-3xl py-16"
    data-test="show-page"
  >
    <div class="space-y-3">
      <UBadge
        v-if="data.categoryName"
        color="neutral"
        variant="subtle"
      >
        {{ data.categoryName }}
      </UBadge>
      <h1 class="nnt-headline text-4xl">
        {{ show.title }}
      </h1>
      <p
        v-if="show.subtitle"
        class="text-lg text-muted"
      >
        {{ show.subtitle }}
      </p>
    </div>

    <p
      v-if="show.description"
      class="mt-6 text-lg"
    >
      {{ show.description }}
    </p>

    <p
      v-if="show.longDescription"
      class="mt-4 whitespace-pre-line text-muted"
    >
      {{ show.longDescription }}
    </p>

    <UCard class="mt-10">
      <template #header>
        <h2 class="font-semibold">
          Before you book
        </h2>
      </template>

      <dl class="grid gap-4 sm:grid-cols-2">
        <div>
          <dt class="text-sm text-muted">
            Age guidance
          </dt>
          <dd data-test="age-guidance">
            {{ show.ageGuidance ?? 'None stated' }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            Running time
          </dt>
          <dd data-test="running-time">
            {{ shape?.durationMinutes ? `${shape.durationMinutes} minutes` : 'Not yet confirmed' }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            Interval
          </dt>
          <dd data-test="interval">
            {{ shape ? saysInterval(shape) : 'Not yet confirmed' }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-muted">
            Latecomers
          </dt>
          <dd data-test="latecomers">
            {{ saysLatecomerPolicy(show.latecomerPolicy) }}
          </dd>
        </div>
      </dl>
    </UCard>

    <!-- Three states, not two: nobody having looked is not the same answer as somebody having
         looked and found nothing, so the page says which it is (D-102 criterion 2). -->
    <UCard
      class="mt-6"
      data-test="warnings"
    >
      <template #header>
        <h2 class="font-semibold">
          {{ saysAssessment(data.assessment) }}
        </h2>
      </template>

      <p
        v-if="data.assessment === 'CONFIRMED_NONE'"
        class="text-muted"
        data-test="warnings-none"
      >
        Somebody has been through this show and found nothing that needs a warning.
      </p>

      <p
        v-else-if="data.assessment === 'NOT_ASSESSED'"
        class="text-muted"
        data-test="warnings-unassessed"
      >
        Nobody has been through this show yet, so the absence of warnings here means nothing has
        been checked rather than that there is nothing to say. Ask the box office if it matters to
        you.
      </p>

      <ul
        v-else
        class="divide-y divide-default"
        data-test="warnings-list"
      >
        <li
          v-for="warning in data.warnings"
          :key="warning.slug"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
          :data-test="`warning-${warning.slug}`"
        >
          <span class="font-medium">{{ warning.title }}</span>
          <UBadge
            v-if="saysWarningLevel(warning.level)"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            {{ saysWarningLevel(warning.level) }}
          </UBadge>
          <span
            v-if="warning.description"
            class="text-sm text-muted"
          >
            {{ warning.description }}
          </span>
        </li>
      </ul>
    </UCard>

    <h2 class="nnt-headline mt-10 text-2xl">
      Performances
    </h2>

    <p
      v-if="data.performances.length === 0"
      class="mt-4 text-muted"
      data-test="no-performances"
    >
      Nothing left to come. This show has finished its run.
    </p>

    <ul
      v-else
      class="mt-4 divide-y divide-default"
    >
      <li
        v-for="performance in data.performances"
        :key="performance.id"
        class="space-y-2 py-4"
        :data-test="`performance-${performance.id}`"
      >
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="font-medium">{{ saysWhen(performance.startsAt) }}</span>
          <span class="text-sm text-muted">{{ performance.venueName }}</span>
          <span
            v-if="performance.doorsAt"
            class="text-sm text-muted"
          >
            Doors {{ formatLondon(new Date(performance.doorsAt * 1000), { hour: '2-digit', minute: '2-digit' }) }}
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
            <!-- saleRefusal refuses a link-out, so its availability reads booking closed; saying
                 that beside a working link would be a contradiction. -->
            <UBadge
              v-else-if="performance.externalBookingUrl"
              color="neutral"
              variant="subtle"
              :data-test="`availability-${performance.id}`"
            >
              Tickets sold elsewhere
            </UBadge>
            <UBadge
              v-else
              :color="COLOURS[performance.availability]"
              variant="subtle"
              :data-test="`availability-${performance.id}`"
            >
              {{ performance.says }}
            </UBadge>
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
          </div>
        </div>

        <p
          v-if="performance.prices.length"
          class="text-sm text-muted"
          :data-test="`prices-${performance.id}`"
        >
          <span
            v-for="(price, index) in performance.prices"
            :key="price.name"
          >{{ index ? ' · ' : '' }}{{ price.name }} {{ saysPrice(price.price) }}</span>
        </p>
      </li>
    </ul>

    <!-- D-104 builds the reservation flow; until then the page says how a seat is actually held. -->
    <UAlert
      class="mt-10"
      color="neutral"
      variant="subtle"
      icon="i-lucide-ticket"
      title="How booking works"
      description="Online booking holds your seats and the box office takes payment at the theatre, in person, on the night. Booking online is not open yet; ring or email the box office to hold seats in the meantime."
    />
  </UContainer>
</template>
