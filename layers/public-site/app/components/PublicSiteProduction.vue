<!-- A production's public page (C-39, core domain specification part 5, wireframe W1): the poster,
     what it is, its advisories one press away, every public date with its booking action, the cast
     and team, and the photos. It lives at /whats-on/<slug> while current and /shows/<slug> once past
     (C-46); an old slug or the other prefix redirects to the right address. A cancelled date stays,
     struck through, until it has passed. The dates panel says when latecomers are let in, and a date
     that differs says so. It carries event data search engines read, and a social card. The top is
     the spotlight's dark band with the show's facts and next dates (docs/kit/interface.md). -->
<script setup lang="ts">
interface Image { url: string, alt: string, width: number | null, height: number | null }
interface Note { termId: string, label: string, detail: string | null }
interface Booking { state: 'available' | 'limited' | 'sold-out' | 'not-yet' | 'closed', link?: string, seatsLeft?: number, opensAt?: number, waitingList?: string, label?: string, external?: true }
interface Performance {
  id: string
  startsAt: number
  doorsAt: number | null
  endsAt: number
  state: 'scheduled' | 'cancelled' | 'completed'
  label: string | null
  venue: { id: string, slug: string, name: string }
  space: { id: string, name: string }
  access: Note[]
  effectsOff: string[]
  /** Absent from an answer cached before latecomers were added. */
  latecomers?: string
  booking: Booking | null
}
interface VenueSummary {
  id: string
  slug: string
  name: string
  address: { lines: string[], locality: string | null, postcode: string | null, country: string | null }
  access: { termId: string, label: string, icon: string | null, note: string | null }[]
}
interface Production {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  description: string | null
  category: { label: string } | null
  season: { name: string } | null
  companyName: string | null
  ageGuidance: string | null
  ageRestricted: boolean
  effects: { termId: string, label: string, description: string | null, icon: string | null, detail: string | null }[]
  effectsConfirmedNone: boolean
  advisories: { termId: string, label: string, heading: string | null, level: 'mentioned' | 'discussed' | 'depicted' | null, detail: string | null }[]
  advisoriesConfirmedNone: boolean
  contentNote: string | null
  runningMinutes: number | null
  intervalCount: number
  /** When latecomers are let in to this show; a date with no interval may differ. Absent from an older cached answer. */
  latecomers?: string
  state: 'published' | 'cancelled'
  past: boolean
  credits: { id: string, creditedName: string, role: string, section: string }[]
  poster: Image | null
  photos: Image[]
  performances: Performance[]
  /** Absent from an answer cached before venues were added. */
  venues?: VenueSummary[]
  price: PriceSummaryView | null
}

const props = defineProps<{ slug: string, prefix: 'whats-on' | 'shows' }>()
const { t } = useT()
const { dateTime, dayNamed, span, time } = useDates()

const { data } = await useAPI<Production | { moved: string }>(() => `/api/public-site/productions/${encodeURIComponent(props.slug)}`, { key: `public-site:production:${props.slug}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.production.not-found'), fatal: true })
// An old slug, or a current show under /shows (or a past one under /whats-on), goes to its address.
// Both redirects are temporary (C-46): a show moves to /shows when it closes, and back if a date is added.
const moved = 'moved' in data.value ? data.value.moved : null
const here = 'moved' in data.value ? null : data.value
const prefix = here ? (here.past ? 'shows' : 'whats-on') : props.prefix
if (moved || prefix !== props.prefix) await navigateTo(`/${prefix}/${moved ?? props.slug}`, { replace: true, redirectCode: 302 })
const production = computed(() => (data.value && !('moved' in data.value) ? data.value : null))
const priceLine = computed(() => production.value?.price ? priceSummary(production.value.price, t) : '')

// What it is, in one line: where, how long, and the company for a visiting show.
const tell = useTellMeAbout()
const asked = computed(() => (production.value?.advisories ?? []).filter(a => tell.has(a.termId)))
const venues = computed(() => [...new Set((production.value?.performances ?? []).map(p => p.venue.name))])
const length = computed(() => {
  const p = production.value
  if (!p?.runningMinutes) return null
  const hours = Math.floor(p.runningMinutes / 60) // not-policy: minutes in an hour
  const minutes = p.runningMinutes % 60 // not-policy: minutes in an hour
  const parts = [hours ? t('public-site.production.hours', { count: hours }) : '', minutes ? t('public-site.production.minutes', { count: minutes }) : ''].filter(Boolean).join(' ')
  return p.intervalCount ? t('public-site.production.with-intervals', { length: parts, count: p.intervalCount }) : parts
})
// Each venue's name links to its page where the venue is public; the rest of the line follows.
const places = computed(() => {
  const known = new Map((production.value?.venues ?? []).map(v => [v.id, v]))
  const seen = new Map<string, { name: string, slug: string | null }>()
  for (const p of production.value?.performances ?? []) if (!seen.has(p.venue.id)) seen.set(p.venue.id, { name: p.venue.name, slug: known.has(p.venue.id) ? p.venue.slug : null })
  return [...seen.values()]
})
// The top's facts (concept A, "Spotlight", chosen by Matt on 19 November 2026): each shown only when known.
const runs = computed(() => {
  const on = (production.value?.performances ?? []).filter(p => p.state !== 'cancelled')
  return on.length ? span(on[0]!.startsAt, on.at(-1)!.startsAt) : ''
})
const facts = computed(() => [
  { label: t('public-site.production.fact-dates'), value: runs.value },
  { label: t('public-site.production.fact-length'), value: length.value },
  { label: t('public-site.production.fact-tickets'), value: priceLine.value },
  { label: t('public-site.production.fact-guidance'), value: production.value?.ageGuidance },
].filter(f => f.value))
const addressOf = (v: VenueSummary) => [...v.address.lines, [v.address.locality, v.address.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
const eyebrow = computed(() => [production.value?.season?.name, production.value?.category?.label].filter(Boolean).join(' · '))

// Every public date, cancelled ones struck through. With one date, its action shows at the top too.
const dates = computed(() => production.value?.performances ?? [])
// On a phone the date buttons already book every date when there are few, so the jump button would be a third way in.
const SHOWN = 4 // not-policy: how many date buttons the top shows
const loadedAt = Date.now()
const comingDates = computed(() => dates.value.filter(d => d.state === 'scheduled' && d.startsAt >= loadedAt).length)
const allDatesShown = computed(() => comingDates.value > 0 && comingDates.value <= SHOWN)
const only = computed(() => (dates.value.length === 1 && dates.value[0]!.state === 'scheduled' ? dates.value[0] : null))
// The dates and tickets panel: beside the story from lg, sticky; on a phone, after the guidance, with
// a button by the title that jumps to it.
const hasPanel = computed(() => !!production.value && (dates.value.length > 0 || !production.value.past || (production.value.venues?.length ?? 0) > 0))
// A date says when latecomers are let in only where it differs from the show (one with no interval).
const differs = (p: Performance) => !!p.latecomers && p.state === 'scheduled' && p.latecomers !== production.value?.latecomers
const where = (p: Performance) => venues.value.length > 1 || p.space.name !== p.venue.name ? `${p.space.name}, ${p.venue.name}` : ''
const credits = computed(() => {
  const sections = new Map<string, { section: string, people: { id: string, creditedName: string, role: string }[] }>()
  for (const c of production.value?.credits ?? []) {
    if (!sections.has(c.section)) sections.set(c.section, { section: c.section, people: [] })
    sections.get(c.section)!.people.push(c)
  }
  return [...sections.values()]
})

// The social card and the event data search engines read (schema.org TheaterEvent, one per date).
const origin = useRequestURL().origin
const absolute = (url: string) => new URL(url, origin).toString()
useSeoMeta({
  title: () => production.value?.title ?? '',
  description: () => markdownText(production.value?.summary) || undefined,
  ogTitle: () => production.value?.title ?? '',
  ogDescription: () => markdownText(production.value?.summary) || undefined,
  ogType: 'website',
  ogUrl: () => absolute(`/${prefix}/${props.slug}`),
  ogImage: () => (production.value?.poster ? absolute(production.value.poster.url) : undefined),
  ogImageAlt: () => production.value?.poster?.alt || undefined,
  twitterCard: () => (production.value?.poster ? 'summary_large_image' : 'summary'),
})
useHead(() => {
  const p = production.value
  if (!p) return {}
  const events = p.performances.map(f => ({
    '@context': 'https://schema.org',
    '@type': 'TheaterEvent',
    'name': p.title,
    'description': markdownText(p.summary) || undefined,
    'startDate': new Date(f.startsAt).toISOString(),
    'endDate': new Date(f.endsAt).toISOString(),
    'eventStatus': f.state === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'location': { '@type': 'Place', 'name': f.venue.name },
    'image': p.poster ? [absolute(p.poster.url)] : undefined,
    'url': absolute(`/${prefix}/${p.slug}`),
    ...(f.booking?.link ? { offers: { '@type': 'Offer', 'url': absolute(f.booking.link), 'availability': f.booking.state === 'sold-out' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' } } : {}),
  }))
  // "<" is escaped so a title can never close the script element.
  return {
    link: [{ key: 'canonical', rel: 'canonical', href: absolute(`/${prefix}/${p.slug}`) }],
    script: [{ key: 'public-site-events', type: 'application/ld+json', innerHTML: JSON.stringify(events).replace(/</g, '\\u003c') }],
  }
})
</script>

<template>
  <div v-if="production">
    <!-- Drawn dark in both colour modes, like the spotlight on what's on. The public-show-* classes are
         hooks for a theatre's own styling. On a phone the poster sits small beside the title. -->
    <section
      class="public-show-top dark bg-default text-default"
      aria-labelledby="show-title"
    >
      <UContainer :class="['grid gap-x-4 gap-y-5 py-6 sm:gap-x-8 sm:py-10 lg:gap-x-12 lg:py-14', production.poster ? 'grid-cols-[6rem_minmax(0,1fr)] sm:grid-cols-[12rem_minmax(0,1fr)] lg:grid-cols-[17.5rem_minmax(0,1fr)]' : '']">
        <img
          v-if="production.poster"
          :src="production.poster.url"
          :alt="production.poster.alt"
          :width="production.poster.width ?? undefined"
          :height="production.poster.height ?? undefined"
          class="public-show-poster aspect-[2/3] w-full rounded-md object-cover sm:row-span-2"
        >
        <header class="min-w-0 space-y-2 self-center sm:self-end">
          <p
            v-if="eyebrow"
            class="text-sm font-semibold tracking-wider text-primary uppercase"
          >
            {{ eyebrow }}
          </p>
          <h1
            id="show-title"
            class="public-show-title text-3xl font-bold text-highlighted text-balance sm:text-5xl"
          >
            {{ production.title }}
          </h1>
          <p
            v-if="production.subtitle"
            class="text-lg text-toned"
          >
            {{ production.subtitle }}
          </p>
          <UBadge
            v-if="production.state === 'cancelled'"
            color="error"
            variant="subtle"
            :label="t('public-site.production.cancelled')"
          />
        </header>

        <div :class="['min-w-0 space-y-5', production.poster ? 'col-span-2 sm:col-span-1 sm:col-start-2' : '']">
          <MarkdownText
            v-if="production.summary"
            :text="production.summary"
            class="max-w-2xl text-toned"
          />
          <p
            v-if="production.companyName"
            class="text-sm text-muted"
          >
            {{ t('public-site.production.presented-by', { company: production.companyName }) }}
          </p>
          <dl
            v-if="facts.length"
            class="grid grid-cols-2 gap-x-6 gap-y-4 xl:grid-cols-4"
          >
            <div
              v-for="f in facts"
              :key="f.label"
            >
              <dt class="text-sm text-muted">
                {{ f.label }}
              </dt>
              <dd class="font-medium">
                {{ f.value }}
              </dd>
            </div>
          </dl>
          <p
            v-if="places.length"
            class="text-sm text-muted"
          >
            <span
              v-for="(v, i) in places"
              :key="v.name"
            ><ULink
              v-if="v.slug"
              :to="`/venues/${v.slug}`"
              class="text-default underline underline-offset-2 hover:text-primary"
            >{{ v.name }}</ULink><span v-else>{{ v.name }}</span><span v-if="i < places.length - 1">, </span></span>
          </p>
          <PublicSiteDateButtons
            v-if="!only"
            :performances="dates"
            :shown="SHOWN"
            :title="production.title"
            more="#dates"
          />
          <div class="public-show-actions flex flex-wrap items-center gap-3">
            <PublicSiteBookingButton
              v-if="only"
              :booking="only.booking"
              :when="dateTime(only.startsAt)"
              :company="production.companyName"
              :title="production.title"
              size="lg"
              class="justify-start"
            />
            <UButton
              v-else-if="dates.some(d => d.state === 'scheduled')"
              to="#dates"
              :label="t('public-site.production.book')"
              trailing-icon="i-lucide-arrow-down"
              size="lg"
              :class="['public-show-book', allDatesShown ? 'max-sm:hidden' : '']"
            />
          </div>
        </div>
      </UContainer>
    </section>

    <UContainer>
      <UPage>
        <div :class="['grid gap-8 py-8', hasPanel ? 'lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]' : '']">
          <div class="min-w-0 space-y-6 lg:col-start-1">
            <section
              v-if="production.effects.length"
              aria-labelledby="effects-heading"
              class="space-y-2"
            >
              <h2
                id="effects-heading"
                class="text-lg font-semibold text-highlighted"
              >
                {{ t('public-site.production.effects') }}
              </h2>
              <ul class="space-y-1">
                <li
                  v-for="e in production.effects"
                  :key="e.termId"
                  class="flex items-start gap-2"
                >
                  <UIcon
                    :name="e.icon ?? 'i-lucide-triangle-alert'"
                    class="mt-1 size-4 shrink-0 text-muted"
                  />
                  <span><span class="font-medium">{{ e.label }}</span><span v-if="e.detail">: {{ e.detail }}</span></span>
                </li>
              </ul>
            </section>

            <section
              v-if="asked.length"
              class="space-y-1 rounded-lg border border-default bg-elevated/50 px-4 py-3"
              :aria-label="t('public-site.production.asked-heading')"
            >
              <h2 class="text-sm font-semibold text-highlighted">
                {{ t('public-site.production.asked-heading') }}
              </h2>
              <ul class="space-y-1">
                <li
                  v-for="a in asked"
                  :key="a.termId"
                >
                  <span class="font-medium">{{ a.label }}</span><span v-if="a.level"> · {{ t(`public-site.production.level-${a.level}`) }}</span><span v-if="a.detail">: {{ a.detail }}</span>
                </li>
              </ul>
            </section>

            <UCollapsible
              v-if="production.advisories.length || production.contentNote"
              class="group rounded-lg border border-default"
            >
              <UButton
                color="neutral"
                variant="ghost"
                block
                class="justify-between px-4 py-3"
                trailing-icon="i-lucide-chevron-down"
                :ui="{ trailingIcon: 'transition-transform duration-200 group-data-[state=open]:rotate-180' }"
                :label="t('public-site.production.advisories', { count: production.advisories.length })"
              />
              <template #content>
                <div class="space-y-2 px-4 pb-4">
                  <ul class="space-y-2">
                    <li
                      v-for="a in production.advisories"
                      :key="a.termId"
                      class="flex items-start justify-between gap-2"
                    >
                      <UCollapsible
                        v-if="a.detail"
                        class="group/warning min-w-0 flex-1"
                      >
                        <UButton
                          color="neutral"
                          variant="link"
                          class="p-0 text-start text-default"
                          trailing-icon="i-lucide-chevron-down"
                          :ui="{ trailingIcon: 'transition-transform duration-200 group-data-[state=open]/warning:rotate-180' }"
                          :aria-label="t('public-site.production.warning-detail', { label: a.label })"
                        >
                          <span><span class="font-medium">{{ a.label }}</span><span v-if="a.level"> · {{ t(`public-site.production.level-${a.level}`) }}</span></span>
                        </UButton>
                        <template #content>
                          <p class="mt-1 text-sm text-muted">
                            {{ a.detail }}
                          </p>
                        </template>
                      </UCollapsible>
                      <span
                        v-else
                        class="min-w-0 flex-1"
                      ><span class="font-medium">{{ a.label }}</span><span v-if="a.level"> · {{ t(`public-site.production.level-${a.level}`) }}</span></span>
                      <IconButton
                        :icon="tell.has(a.termId) ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
                        :label="t(tell.has(a.termId) ? 'public-site.production.tell-remove' : 'public-site.production.tell-add', { label: a.label })"
                        :aria-pressed="tell.has(a.termId)"
                        :variant="tell.has(a.termId) ? 'soft' : 'ghost'"
                        size="xs"
                        @click="tell.toggle(a.termId)"
                      />
                    </li>
                  </ul>
                  <p class="text-xs text-muted">
                    {{ t('public-site.production.tell-note') }}
                    <UButton
                      v-if="tell.ids.value.length"
                      :label="t('public-site.production.tell-clear')"
                      color="neutral"
                      variant="link"
                      size="xs"
                      @click="tell.clear()"
                    />
                  </p>
                  <MarkdownText
                    v-if="production.contentNote"
                    :text="production.contentNote"
                    class="text-sm text-muted"
                  />
                </div>
              </template>
            </UCollapsible>
            <p
              v-if="!production.effects.length && production.effectsConfirmedNone && !production.advisories.length && production.advisoriesConfirmedNone"
              class="text-sm text-muted"
            >
              {{ t('public-site.production.no-advisories') }}
            </p>
            <template v-else>
              <p
                v-if="!production.effects.length && production.effectsConfirmedNone"
                class="text-sm text-muted"
              >
                {{ t('public-site.production.no-effects') }}
              </p>
              <p
                v-if="!production.advisories.length && production.advisoriesConfirmedNone"
                class="text-sm text-muted"
              >
                {{ t('public-site.production.no-warnings') }}
              </p>
            </template>
          </div>

          <aside
            v-if="hasPanel"
            id="dates"
            class="min-w-0 scroll-mt-24 lg:col-start-2 lg:row-span-2 lg:row-start-1"
          >
            <div class="space-y-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:rounded-lg lg:border lg:border-default lg:p-4">
              <section
                v-if="dates.length"
                aria-labelledby="dates-heading"
              >
                <h2
                  id="dates-heading"
                  class="mb-2 text-lg font-semibold text-highlighted"
                >
                  {{ t('public-site.production.dates-and-tickets') }}
                </h2>
                <LatecomersNote
                  v-if="production.latecomers && !production.past"
                  :rule="production.latecomers"
                  rules
                  class="mb-2"
                />
                <ul class="divide-y divide-default border-y border-default">
                  <li
                    v-for="p in dates"
                    :key="p.id"
                    class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3"
                  >
                    <div class="min-w-0 space-y-1">
                      <p :class="p.state === 'cancelled' ? 'text-muted line-through' : 'font-medium'">
                        <time :datetime="new Date(p.startsAt).toISOString()">{{ dayNamed(p.startsAt) }}</time>
                        <span v-if="p.label"> · {{ p.label }}</span>
                      </p>
                      <p class="text-sm text-muted">
                        <span :class="p.state === 'cancelled' ? undefined : 'font-medium text-default'">{{ time(p.startsAt) }}</span>{{ [where(p), p.doorsAt && p.state === 'scheduled' ? t('public-site.production.doors', { time: time(p.doorsAt) }) : ''].filter(Boolean).map(x => ` · ${x}`).join('') }}
                      </p>
                      <p
                        v-if="p.effectsOff.length && p.state === 'scheduled'"
                        class="text-sm"
                      >
                        {{ t('public-site.production.effects-off', { effects: p.effectsOff.join(', ') }) }}
                      </p>
                      <LatecomersNote
                        v-if="differs(p)"
                        :rule="p.latecomers!"
                      />
                      <ul
                        v-if="p.access.length"
                        class="flex flex-wrap gap-1"
                        :aria-label="t('public-site.production.access')"
                      >
                        <li
                          v-for="a in p.access"
                          :key="a.termId"
                        >
                          <UBadge
                            color="neutral"
                            variant="outline"
                            :label="a.detail ? `${a.label}: ${a.detail}` : a.label"
                          />
                        </li>
                      </ul>
                    </div>
                    <span
                      v-if="p.state === 'cancelled'"
                      class="text-sm font-medium"
                    >{{ t('public-site.production.date-cancelled') }}</span>
                    <div
                      v-else-if="p.state === 'scheduled'"
                      class="flex flex-col items-end gap-1 text-end"
                    >
                      <PublicSiteBookingButton
                        :booking="p.booking"
                        :when="dateTime(p.startsAt)"
                        :company="production.companyName"
                        :title="production.title"
                      />
                      <span
                        v-if="priceLine"
                        class="text-sm text-muted"
                      >{{ priceLine }}</span>
                    </div>
                  </li>
                </ul>
              </section>
              <p
                v-else-if="!production.past"
                class="text-muted"
              >
                {{ t('public-site.production.dates-soon') }}
              </p>

              <section
                v-if="production.venues?.length"
                aria-labelledby="venue-heading"
                class="space-y-3"
              >
                <h2
                  id="venue-heading"
                  class="text-lg font-semibold text-highlighted"
                >
                  {{ t('public-site.production.venue-heading') }}
                </h2>
                <div
                  v-for="v in production.venues"
                  :key="v.id"
                  class="space-y-2"
                >
                  <p>
                    <ULink
                      :to="`/venues/${v.slug}`"
                      class="font-medium text-highlighted underline underline-offset-2 hover:text-primary"
                    >
                      {{ v.name }}
                    </ULink>
                  </p>
                  <p
                    v-if="addressOf(v)"
                    class="text-sm text-muted"
                  >
                    {{ addressOf(v) }}
                  </p>
                  <ul
                    v-if="v.access.length"
                    class="flex flex-wrap gap-1"
                    :aria-label="t('public-site.venue.access')"
                  >
                    <li
                      v-for="a in v.access"
                      :key="a.termId"
                    >
                      <UBadge
                        :label="a.label"
                        :icon="a.icon ?? 'i-lucide-check'"
                        color="neutral"
                        variant="outline"
                        size="sm"
                      />
                    </li>
                  </ul>
                  <UButton
                    :to="`/venues/${v.slug}`"
                    :label="t('public-site.production.venue-more', { venue: v.name })"
                    trailing-icon="i-lucide-arrow-right"
                    color="neutral"
                    variant="link"
                    size="sm"
                    class="px-0"
                  />
                </div>
              </section>
            </div>
          </aside>

          <div class="min-w-0 space-y-6 lg:col-start-1">
            <section
              v-if="production.description?.trim()"
              aria-labelledby="about-heading"
              class="space-y-3"
            >
              <h2
                id="about-heading"
                class="text-lg font-semibold text-highlighted"
              >
                {{ t('public-site.production.about') }}
              </h2>
              <MarkdownText :text="production.description" />
            </section>

            <section
              v-if="credits.length"
              aria-labelledby="credits-heading"
              class="space-y-4"
            >
              <h2
                id="credits-heading"
                class="text-lg font-semibold text-highlighted"
              >
                {{ t('public-site.production.credits') }}
              </h2>
              <div
                v-for="s in credits"
                :key="s.section"
              >
                <h3 class="mb-1 text-sm font-semibold text-muted">
                  {{ s.section }}
                </h3>
                <dl class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                  <template
                    v-for="c in s.people"
                    :key="c.id"
                  >
                    <dt class="text-muted">
                      {{ c.role }}
                    </dt>
                    <dd>{{ c.creditedName }}</dd>
                  </template>
                </dl>
              </div>
            </section>

            <section
              v-if="production.photos.length"
              aria-labelledby="photos-heading"
            >
              <h2
                id="photos-heading"
                class="mb-2 text-lg font-semibold text-highlighted"
              >
                {{ t('public-site.production.photos') }}
              </h2>
              <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <li
                  v-for="photo in production.photos"
                  :key="photo.url"
                >
                  <img
                    :src="photo.url"
                    :alt="photo.alt"
                    :width="photo.width ?? undefined"
                    :height="photo.height ?? undefined"
                    loading="lazy"
                    class="aspect-[3/2] w-full rounded-md object-cover"
                  >
                </li>
              </ul>
            </section>
          </div>
        </div>
      </UPage>
    </UContainer>
  </div>
</template>
