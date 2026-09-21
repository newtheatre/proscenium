<script setup lang="ts">
import { saysNoSuch } from '#shared/utils/no-such'
import { groupContentWarnings, saysAssessment } from '#shared/utils/content-warnings'
import { saysClock, saysDay, saysWhenLong } from '#shared/utils/when'
import { SAYS_BOOKING_HOLDS, SAYS_PAYMENT, TO_BE_CONFIRMED, saysLatecomerPolicy } from '#shared/utils/programme'
import { pounds, saysPrice, saysRestriction } from '#shared/utils/ticket-types'
import { DEFAULT_OG_IMAGE, SITE_ADDRESS } from '#shared/utils/seo'
import type { Availability, ListedPerformance, ListedShow } from '#shared/utils/programme'

// Deliberately public: one show, its warnings and the practical details somebody needs before they
// decide (D-101, D-102). A draft show has no page here at all, which is a 404 and not a thin one.

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data } = await useFetch<ListedShow>(() => `/api/shows/${slug.value}`)

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: saysNoSuch('show', 'Go back to what is on and choose another'), fatal: true })
}

const show = computed(() => data.value!.show)

useSeoMeta({
  title: () => show.value.title,
  description: () => show.value.description ?? `${show.value.title} at the Nottingham New Theatre.`,
  // The poster when the show has one, the house image otherwise (K-125 criterion 3).
  ogImage: () => show.value.posterUrl ?? DEFAULT_OG_IMAGE,
})

const AVAILABILITY: Record<Availability, 'InStock' | 'LimitedAvailability' | 'SoldOut' | 'OutOfStock'> = {
  AVAILABLE: 'InStock',
  LIMITED: 'LimitedAvailability',
  SOLD_OUT: 'SoldOut',
  BOOKING_CLOSED: 'OutOfStock',
}

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString()

// One TheaterEvent per performance with an offer per price (K-125 criterion 4). An offer points
// at this page, not the booking form, which crawlers are kept off; the organiser is the site.
useSchemaOrg(computed(() => (data.value?.performances ?? []).map(performance => defineEvent({
  '@type': 'TheaterEvent',
  'name': show.value.title,
  'description': show.value.description ?? undefined,
  'image': show.value.posterUrl ?? DEFAULT_OG_IMAGE,
  'startDate': iso(performance.startsAt),
  'endDate': performance.durationMinutes !== null ? iso(performance.startsAt + performance.durationMinutes * 60) : undefined,
  'eventStatus': performance.cancelled ? 'EventCancelled' : 'EventScheduled',
  'eventAttendanceMode': 'OfflineEventAttendanceMode',
  'location': { '@type': 'Place', 'name': performance.venueName, 'address': SITE_ADDRESS },
  'organizer': { '@id': '#identity' },
  'offers': performance.prices.map(price => ({
    '@type': 'Offer',
    'name': price.name,
    'price': pounds(price.price),
    'priceCurrency': 'GBP',
    'availability': AVAILABILITY[performance.availability],
    'url': performance.externalBookingUrl ?? `/shows/${show.value.slug}`,
    'validThrough': iso(performance.bookingClosesAt),
  })),
}))))

const saysNight = (at: number): string => saysWhenLong(at)

const day = (at: number): string => saysDay(at)

// Gold is the limelight: the night that is nearly gone is the one worth looking at twice
// (show-page.png). Available says nothing extra, which is why it reads muted.
const TAG_CLASS: Record<Availability, string> = {
  AVAILABLE: 'text-muted',
  LIMITED: 'text-gold-700 dark:text-gold-400',
  SOLD_OUT: 'text-muted',
  BOOKING_CLOSED: 'text-muted',
}

// Every performance of one show may differ in running time, so the practical details come from the
// first one actually on offer: a cancelled first night would otherwise describe the whole run.
const shape = computed(() => {
  const performances = data.value?.performances ?? []
  return performances.find(one => !one.cancelled) ?? performances[0] ?? null
})

const onOffer = computed(() => (data.value?.performances ?? []).filter(one => !one.cancelled))

// Where the hero's one call to action points: the first night still bookable from this site.
const bookable = computed(() => onOffer.value.find(one =>
  !one.externalBookingUrl && (one.availability === 'AVAILABLE' || one.availability === 'LIMITED')) ?? null)

const runs = computed(() => {
  const times = onOffer.value.map(one => one.startsAt).sort((a, b) => a - b)
  const first = times[0]
  const last = times[times.length - 1]
  if (first === undefined || last === undefined) return TO_BE_CONFIRMED
  return first === last ? day(first) : `${day(first)} to ${day(last)}`
})

const venues = computed(() => [...new Set(onOffer.value.map(one => one.venueName))])

const from = computed(() => {
  const prices = onOffer.value.flatMap(one => one.prices.map(price => price.price)).sort((a, b) => a - b)
  return prices[0] === undefined ? null : saysPrice(prices[0])
})

// The run's distinct prices as one line: cheapest first, each carrying its restriction so
// "£4.00 members" reads as the condition it is (show-page.png).
const tickets = computed(() => {
  const seen = new Map<string, { price: number, restrictedTo: string | null }>()
  for (const price of onOffer.value.flatMap(one => one.prices)) {
    const key = `${price.price}:${price.restrictedTo ?? ''}`
    if (!seen.has(key)) seen.set(key, { price: price.price, restrictedTo: price.restrictedTo })
  }
  return [...seen.values()]
    .sort((a, b) => b.price - a.price)
    .map(price => [saysPrice(price.price), saysRestriction(price.restrictedTo)].filter(Boolean).join(' '))
})

function saysInterval(performance: ListedPerformance): string {
  if (performance.intervalCount === 0) return 'Straight through, with no interval'
  const each = performance.intervalMinutes ? ` of ${performance.intervalMinutes} minutes` : ''
  return performance.intervalCount === 1 ? `One interval${each}` : `${performance.intervalCount} intervals${each}`
}
</script>

<template>
  <div
    v-if="data"
    data-test="show-page"
  >
    <!-- The view's one spotlight, marked dark so every token inside resolves for stage black
         rather than being overridden slot by slot (docs/design-language.md, chrome rule 1). -->
    <div class="dark nnt-spotlight">
      <UContainer class="grid gap-8 py-12 lg:grid-cols-[320px_1fr] lg:gap-12 lg:py-16">
        <!-- Untitled: the show's name is the h1 beside this frame, so the frame drawing it too
             would say it twice. Seeded on the slug, as the listing's frames are. -->
        <PosterFrame
          :title="show.title"
          :slug="show.slug"
          :titled="false"
          :poster-url="show.posterUrl"
          sizes="xs:90vw sm:60vw md:40vw lg:320px xl:320px 2xl:320px"
          class="ring-2 ring-gold-400"
        />

        <div>
          <p
            class="text-sm uppercase tracking-wide text-muted"
            data-test="show-kicker"
          >
            <span v-if="data.categoryName">{{ data.categoryName }}</span>
            <span v-if="data.categoryName && venues.length === 1"> · </span>
            <span v-if="venues.length === 1">{{ venues[0] }}</span>
          </p>

          <h1 class="nnt-headline mt-2 text-4xl text-highlighted sm:text-5xl">
            {{ show.title }}
          </h1>
          <p
            v-if="show.subtitle"
            class="mt-3 text-lg text-default"
          >
            {{ show.subtitle }}
          </p>
          <p
            v-if="show.description"
            class="mt-3 max-w-2xl text-default"
          >
            {{ show.description }}
          </p>

          <!-- Four facts, in the body face: the ones somebody decides on. Interval and latecomers
               are practical detail and sit with the prose below (show-page.png, D-102). -->
          <dl class="mt-8 grid grid-cols-1 gap-x-6 gap-y-5 text-default sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt class="text-sm text-muted">
                Dates
              </dt>
              <dd data-test="show-dates">
                {{ runs }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Running time
              </dt>
              <dd data-test="running-time">
                {{ shape?.durationMinutes ? `${shape.durationMinutes} minutes` : TO_BE_CONFIRMED }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Tickets
              </dt>
              <dd data-test="show-tickets">
                {{ tickets.length ? tickets.join(' · ') : TO_BE_CONFIRMED }}
              </dd>
            </div>
            <div>
              <dt class="text-sm text-muted">
                Guidance
              </dt>
              <dd data-test="age-guidance">
                {{ show.ageGuidance ?? TO_BE_CONFIRMED }}
              </dd>
            </div>
          </dl>

          <div class="mt-8">
            <!-- The view's one marquee: the night a visitor most likely wants, which is the first
                 still on sale here. The header's own action is a poster button. -->
            <UButton
              v-if="bookable"
              variant="marquee"
              size="lg"
              :to="`/book/${bookable.id}`"
              data-test="show-book"
            >
              Book tickets
            </UButton>
            <UButton
              v-else
              variant="poster"
              size="lg"
              to="/whats-on"
              data-test="show-whats-on"
            >
              See what else is on
            </UButton>
          </div>
        </div>
      </UContainer>
    </div>

    <UContainer class="grid gap-10 py-12 lg:grid-cols-[1fr_340px] lg:gap-14">
      <div>
        <h2 class="nnt-headline text-2xl">
          About the show
        </h2>
        <p
          v-if="show.longDescription"
          class="mt-4 whitespace-pre-line"
        >
          {{ show.longDescription }}
        </p>
        <p
          v-else-if="show.description"
          class="mt-4"
        >
          {{ show.description }}
        </p>

        <!-- The practical detail the hero's four facts leave out, kept on the page because the
             show page is where D-102 criterion 3 says it belongs. -->
        <p
          class="mt-4 text-sm text-muted"
          data-test="show-practical"
        >
          {{ shape ? saysInterval(shape) : TO_BE_CONFIRMED }}. {{ saysLatecomerPolicy(show.latecomerPolicy) }}
        </p>

        <!-- Three states, not two: nobody having looked is not the same answer as somebody having
             looked and found nothing, so the page says which it is (D-102 criterion 2). -->
        <UCard
          class="mt-10"
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

          <!-- Staging first, then what is shown before what is talked about: the strongest claim
               is the one somebody decides on, so it leads (D-102 criterion 1). -->
          <div
            v-else
            class="space-y-5"
            data-test="warnings-list"
          >
            <section
              v-for="group in groupContentWarnings(data.warnings)"
              :key="group.key"
              :data-test="`warnings-${group.key.toLowerCase()}`"
            >
              <div class="mb-2 flex flex-wrap items-baseline gap-x-2">
                <UIcon
                  :name="group.icon"
                  class="size-4 shrink-0 self-center text-muted"
                />
                <h3 class="font-semibold">
                  {{ group.label }}
                </h3>
                <span class="text-xs text-muted">{{ group.hint }}</span>
              </div>
              <!-- The description is text beside the badge, never a hover title: a phone has no
                   hover and a screen reader reads no `title` (D-102 criterion 5). -->
              <ul class="space-y-2">
                <li
                  v-for="warning in group.warnings"
                  :key="warning.slug"
                  class="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                  :data-test="`warning-${warning.slug}`"
                >
                  <UBadge
                    color="warning"
                    variant="subtle"
                    :icon="warning.icon ?? undefined"
                    :label="warning.title"
                  />
                  <span
                    v-if="warning.description"
                    class="text-sm text-muted"
                  >{{ warning.description }}</span>
                </li>
              </ul>
            </section>
          </div>

          <p
            v-if="data.contentNotes"
            class="mt-4 whitespace-pre-line text-sm text-muted"
            data-test="warnings-notes"
          >
            {{ data.contentNotes }}
          </p>
        </UCard>

        <UAlert
          class="mt-6"
          color="info"
          variant="subtle"
          icon="i-lucide-accessibility"
          title="Access"
          description="Members record what they need once in their account, and it travels with every booking. Anybody else speaks to the box office at the theatre, on the night or before it."
          data-test="show-access"
        />
      </div>

      <!-- The performances as a ticket stub: one row per night, picked from here. Below lg it is
           the last thing on the page, which is where a phone wants it (mobile-show.png). -->
      <UCard
        variant="ticket"
        data-test="show-performances"
      >
        <template #header>
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="font-semibold">
              Performances
            </h2>
            <span
              v-if="venues.length === 1"
              class="text-xs uppercase tracking-wide text-muted"
            >{{ venues[0] }}</span>
          </div>
        </template>

        <p
          v-if="data.performances.length === 0"
          class="text-muted"
          data-test="no-performances"
        >
          Nothing left to come. This show has finished its run.
        </p>

        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="performance in data.performances"
            :key="performance.id"
            class="space-y-2 py-3"
            :data-test="`performance-${performance.id}`"
          >
            <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
              <div class="min-w-0">
                <p class="font-medium">
                  {{ saysNight(performance.startsAt) }}
                </p>
                <!-- Colour plus words, never colour alone (docs/design-language.md). An external
                     link reads booking closed, so it says where the tickets are instead. -->
                <p
                  v-if="performance.cancelled"
                  class="text-sm text-error"
                  :data-test="`cancelled-${performance.id}`"
                >
                  Cancelled
                </p>
                <p
                  v-else-if="performance.externalBookingUrl"
                  class="text-sm text-muted"
                  :data-test="`availability-${performance.id}`"
                >
                  Tickets sold elsewhere
                </p>
                <p
                  v-else
                  class="text-sm"
                  :class="TAG_CLASS[performance.availability]"
                  :data-test="`availability-${performance.id}`"
                >
                  {{ performance.says }}
                </p>
              </div>
              <div class="ms-auto flex flex-wrap items-center gap-2">
                <UButton
                  v-if="performance.externalBookingUrl && !performance.cancelled"
                  :to="performance.externalBookingUrl"
                  target="_blank"
                  rel="noopener"
                  size="sm"
                  trailing-icon="i-lucide-external-link"
                  :data-test="`external-${performance.id}`"
                >
                  Book tickets elsewhere
                </UButton>
                <UButton
                  v-else-if="performance.availability === 'AVAILABLE' || performance.availability === 'LIMITED'"
                  :to="`/book/${performance.id}`"
                  size="sm"
                  :data-test="`book-${performance.id}`"
                >
                  Book tickets
                </UButton>
                <UButton
                  v-else-if="performance.availability === 'SOLD_OUT'"
                  :to="`/waiting-list/${performance.id}`"
                  variant="subtle"
                  color="neutral"
                  size="sm"
                  :data-test="`waiting-${performance.id}`"
                >
                  Join the waiting list
                </UButton>
              </div>
            </div>

            <p class="flex flex-wrap gap-x-3 text-sm text-muted">
              <span v-if="venues.length > 1">{{ performance.venueName }}</span>
              <span v-if="performance.doorsAt">
                Doors {{ saysClock(performance.doorsAt) }}
              </span>
            </p>

            <p
              v-if="performance.prices.length"
              class="font-mono text-sm text-muted"
              :data-test="`prices-${performance.id}`"
            >
              <span
                v-for="(price, index) in performance.prices"
                :key="price.name"
              >{{ index ? ' · ' : '' }}{{ price.name }} {{ saysPrice(price.price) }}<template v-if="saysRestriction(price.restrictedTo)"> ({{ saysRestriction(price.restrictedTo) }})</template></span>
            </p>
          </li>
        </ul>

        <template #footer>
          <div class="flex items-center justify-between font-mono">
            <span class="text-sm text-muted">From</span>
            <span>{{ from ?? TO_BE_CONFIRMED }}</span>
          </div>
          <p class="mt-2 text-sm text-muted">
            No booking fees. {{ SAYS_BOOKING_HOLDS }} {{ SAYS_PAYMENT }}
          </p>
        </template>
      </UCard>
    </UContainer>
  </div>
</template>
