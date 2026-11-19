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
interface Booking { state: 'available' | 'limited' | 'sold-out' | 'not-yet' | 'closed', link?: string, external?: true, drawer?: string }
interface Production {
  companyName: string | null
  runningMinutes: number | null
  performances: { id: string, startsAt: number, state: 'scheduled' | 'cancelled' | 'completed', booking: Booking | null }[]
}

const props = defineProps<{ show: Listing }>()
const { t } = useT()
const { span, dayBrief, time, dateTime, toLocal } = useDates()
// The same request, and so the same cached answer, as the production's own page.
const { data } = await useAPI<Production | { moved: string }>(() => `/api/public-site/productions/${encodeURIComponent(props.show.slug)}`, { key: `public-site:production:${props.show.slug}` })
const production = computed(() => (data.value && !('moved' in data.value) ? data.value : null))

const SHOWN = 4 // not-policy: how many dates fit on one line of the spotlight
const now = Date.now()
const upcoming = computed(() => (production.value?.performances ?? []).filter(p => p.state === 'scheduled' && p.startsAt >= now))
const dates = computed(() => upcoming.value.slice(0, SHOWN))
const more = computed(() => upcoming.value.length - dates.value.length)
const to = computed(() => `/whats-on/${props.show.slug}`)
const tonight = computed(() => toLocal(props.show.nextStartsAt).slice(0, 10) === toLocal(now).slice(0, 10)) // not-policy: the date part of a local date and time
const eyebrow = computed(() => [tonight.value ? t('public-site.whats-on.tonight') : t('public-site.whats-on.next-up'), props.show.category?.label].filter(Boolean).join(' · '))
const facts = computed(() => [span(props.show.nextStartsAt, props.show.lastStartsAt), props.show.venues.join(', ')].filter(Boolean).join(' · '))
const priceLine = computed(() => (props.show.price ? priceSummary(props.show.price, t) : ''))
const bookable = (b: Booking | null) => !!b?.link && (b.state === 'available' || b.state === 'limited')
// A date whose booking names a drawer opens it over this page, as the show page's Book buttons do.
const drawn = ref<{ booking: Booking, startsAt: number } | null>(null)
const drawerOpen = ref(false)
function book(event: MouseEvent, p: { booking: Booking | null, startsAt: number }) {
  if (!p.booking?.drawer || p.booking.external || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  drawn.value = { booking: p.booking, startsAt: p.startsAt }
  drawerOpen.value = true
}
const note = (b: Booking | null) => b?.state === 'limited' ? t('public-site.booking.last-few') : b?.state === 'sold-out' ? t('public-site.booking.sold-out') : b?.state === 'not-yet' ? t('public-site.booking.not-yet') : b?.state === 'closed' ? t('public-site.booking.closed') : ''
</script>

<template>
  <section
    class="dark relative overflow-hidden rounded-lg bg-default text-default ring ring-default"
    aria-labelledby="spotlight-title"
  >
    <div :class="['grid gap-6 p-5 sm:gap-8 sm:p-8', show.poster ? 'sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]' : '']">
      <img
        v-if="show.poster"
        :src="show.poster.url"
        :alt="show.poster.alt"
        :width="show.poster.width ?? undefined"
        :height="show.poster.height ?? undefined"
        class="hidden aspect-[2/3] w-full rounded-md object-cover sm:block"
      >
      <div class="flex min-w-0 flex-col gap-3 self-center">
        <p class="text-sm font-semibold uppercase tracking-wider text-primary">
          {{ eyebrow }}
        </p>
        <h2
          id="spotlight-title"
          class="text-4xl font-bold text-highlighted text-balance sm:text-5xl"
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

        <ul
          v-if="dates.length"
          class="mt-1 flex flex-wrap gap-2"
          :aria-label="t('public-site.whats-on.next-dates')"
        >
          <li
            v-for="p in dates"
            :key="p.id"
          >
            <UButton
              v-if="bookable(p.booking)"
              :to="p.booking!.link"
              :target="p.booking!.external ? '_blank' : undefined"
              color="neutral"
              variant="outline"
              class="flex-col items-start gap-0 text-start"
              @click="book($event, p)"
            >
              <span class="font-semibold">{{ dayBrief(p.startsAt) }}</span>
              <span class="text-xs text-muted">{{ [time(p.startsAt), note(p.booking)].filter(Boolean).join(' · ') }}</span>
              <span class="sr-only">{{ t('public-site.booking.book') }}{{ t('public-site.booking.for', { when: dateTime(p.startsAt) }) }}<template v-if="p.booking!.external">{{ t('public-site.booking.new-tab') }}</template></span>
            </UButton>
            <span
              v-else
              class="flex flex-col rounded-md px-2.5 py-1.5 text-sm ring ring-default ring-inset opacity-60"
            >
              <span class="font-semibold">{{ dayBrief(p.startsAt) }}</span>
              <span class="text-xs text-muted">{{ [time(p.startsAt), note(p.booking)].filter(Boolean).join(' · ') }}</span>
            </span>
          </li>
          <li
            v-if="more > 0"
            class="self-center"
          >
            <ULink
              :to="`${to}#dates`"
              class="text-sm font-medium text-primary hover:underline"
            >
              {{ t('public-site.whats-on.more-dates', { count: more }) }}
            </ULink>
          </li>
        </ul>

        <div class="mt-2 flex flex-wrap gap-2">
          <UButton
            :to="`${to}#dates`"
            :label="t('public-site.whats-on.book')"
            size="lg"
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
    <PublicSiteBookingDrawer
      v-if="drawn"
      v-model:open="drawerOpen"
      :name="drawn.booking.drawer!"
      :link="drawn.booking.link!"
      :title="show.title"
      :when="dateTime(drawn.startsAt)"
    />
  </section>
</template>
