<!-- The soonest show, billed at the top of what's on (concept A, "Spotlight", chosen by Matt on
     19 November 2026): its poster, what it is, and its next few dates, each a button straight to
     booking. Drawn dark in both colour modes so it stands apart from the grid below. A show with no
     poster yet takes the full width. -->
<script setup lang="ts">
interface Listing {
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  category: { label: string } | null
  age: string | null
  hasEffects: boolean
  hasWarnings: boolean
  nextStartsAt: number
  lastStartsAt: number
  venues: string[]
  poster: { url: string, alt: string, width: number | null, height: number | null } | null
  price: PriceSummaryView | null
}
interface Booking { state: 'available' | 'limited' | 'sold-out' | 'not-yet' | 'closed', link?: string, external?: true, drawer?: string, seatsLeft?: number, sellingFast?: true }
interface Production {
  companyName: string | null
  runningMinutes: number | null
  performances: { id: string, startsAt: number, state: 'scheduled' | 'cancelled' | 'completed', booking: Booking | null }[]
}

const props = defineProps<{ show: Listing }>()
const { t } = useT()
const { span, toLocal } = useDates()
// The same request, and so the same cached answer, as the production's own page.
const { data } = await useAPI<Production | { moved: string }>(() => `/api/public-site/productions/${encodeURIComponent(props.show.slug)}`, { key: `public-site:production:${props.show.slug}` })
const production = computed(() => (data.value && !('moved' in data.value) ? data.value : null))

const to = computed(() => `/whats-on/${props.show.slug}`)
const tonight = computed(() => toLocal(props.show.nextStartsAt).slice(0, 10) === toLocal(Date.now()).slice(0, 10)) // not-policy: the date part of a local date and time
const eyebrow = computed(() => [tonight.value ? t('public-site.whats-on.tonight') : t('public-site.whats-on.next-up'), props.show.category?.label].filter(Boolean).join(' · '))
const facts = computed(() => [span(props.show.nextStartsAt, props.show.lastStartsAt), props.show.venues.join(', ')].filter(Boolean).join(' · '))
const priceLine = computed(() => (props.show.price ? priceSummary(props.show.price, t) : ''))
</script>

<template>
  <section
    class="public-spotlight dark relative overflow-hidden rounded-lg bg-default text-default ring ring-default"
    aria-labelledby="spotlight-title"
  >
    <div :class="['grid gap-6 p-5 sm:gap-8 sm:p-8', show.poster ? 'sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]' : '']">
      <img
        v-if="show.poster"
        :src="show.poster.url"
        :alt="show.poster.alt"
        :width="show.poster.width ?? undefined"
        :height="show.poster.height ?? undefined"
        class="public-spotlight-poster hidden aspect-[2/3] w-full rounded-md object-cover sm:block"
      >
      <div class="flex min-w-0 flex-col gap-3 self-center">
        <p class="text-sm font-semibold uppercase tracking-wider text-primary">
          {{ eyebrow }}
        </p>
        <h2
          id="spotlight-title"
          class="public-spotlight-title text-4xl font-bold text-highlighted text-balance sm:text-5xl"
        >
          <NuxtLink
            :to="to"
            class="hover:underline focus-visible:underline"
          >{{ show.title }}</NuxtLink>
        </h2>
        <p
          v-if="show.subtitle"
          class="text-lg text-toned"
        >
          {{ show.subtitle }}
        </p>
        <p class="text-sm text-muted">
          {{ facts }}<template v-if="priceLine">
            · {{ priceLine }}
          </template>
        </p>
        <p
          v-if="show.age || show.hasEffects || show.hasWarnings"
          class="flex flex-wrap gap-1"
        >
          <UBadge
            v-if="show.age"
            :label="show.age"
            color="neutral"
            variant="outline"
            size="sm"
          />
          <UBadge
            v-if="show.hasEffects"
            :label="t('public-site.production.effects-badge')"
            icon="i-lucide-zap"
            color="neutral"
            variant="outline"
            size="sm"
          />
          <UBadge
            v-if="show.hasWarnings"
            :label="t('public-site.production.warnings-badge')"
            icon="i-lucide-info"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </p>

        <PublicSiteDateButtons
          v-if="production"
          :performances="production.performances"
          :title="show.title"
          :more="`${to}#dates`"
          class="mt-1"
        />

        <div class="mt-2 flex flex-wrap gap-2">
          <UButton
            :to="`${to}#dates`"
            :label="t('public-site.whats-on.book')"
            size="lg"
            class="public-spotlight-book"
          />
          <UButton
            :to="to"
            :label="t('public-site.whats-on.about')"
            color="neutral"
            variant="outline"
            size="lg"
          />
        </div>
      </div>
    </div>
  </section>
</template>
