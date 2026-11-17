<!-- A production's public page (C-39, core domain specification part 5, wireframe W1): the poster,
     what it is, its advisories one press away, every public date with its booking action, the cast
     and team, and the photos. It lives at /whats-on/<slug> while current and /shows/<slug> once past
     (C-46); an old slug or the other prefix redirects to the right address. A cancelled date stays,
     struck through, until it has passed. It carries event data search engines read, and a social card. -->
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
  booking: Booking | null
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
  state: 'published' | 'cancelled'
  past: boolean
  credits: { id: string, creditedName: string, role: string, section: string }[]
  poster: Image | null
  photos: Image[]
  performances: Performance[]
  price: PriceSummaryView | null
}

const props = defineProps<{ slug: string, prefix: 'whats-on' | 'shows' }>()
const { t } = useT()
const { dateTime, time } = useDates()

const { data } = await useAPI<Production | { moved: string }>(() => `/api/public-site/productions/${encodeURIComponent(props.slug)}`, { key: `public-site:production:${props.slug}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.production.not-found'), fatal: true })
// An old slug, or a current show under /shows (or a past one under /whats-on), goes to its address.
// Both redirects are temporary (C-46): a show moves to /shows when it closes, and back if a date is added.
const moved = 'moved' in data.value ? data.value.moved : null
const here = 'moved' in data.value ? null : data.value
const prefix = here ? (here.past ? 'shows' : 'whats-on') : props.prefix
if (moved || prefix !== props.prefix) await navigateTo(`/${prefix}/${moved ?? props.slug}`, { replace: true, redirectCode: 302 })
const production = computed(() => (data.value && !('moved' in data.value) ? data.value : null))

// What it is, in one line: where, how long, and the company for a visiting show.
const venues = computed(() => [...new Set((production.value?.performances ?? []).map(p => p.venue.name))])
const length = computed(() => {
  const p = production.value
  if (!p?.runningMinutes) return null
  const hours = Math.floor(p.runningMinutes / 60) // not-policy: minutes in an hour
  const minutes = p.runningMinutes % 60 // not-policy: minutes in an hour
  const parts = [hours ? t('public-site.production.hours', { count: hours }) : '', minutes ? t('public-site.production.minutes', { count: minutes }) : ''].filter(Boolean).join(' ')
  return p.intervalCount ? t('public-site.production.with-intervals', { length: parts, count: p.intervalCount }) : parts
})
const facts = computed(() => [venues.value.join(', '), length.value, production.value?.ageGuidance].filter(Boolean).join(' · '))
const eyebrow = computed(() => [production.value?.season?.name, production.value?.category?.label].filter(Boolean).join(' · '))

// Every public date, cancelled ones struck through. With one date, its action shows at the top too.
const dates = computed(() => production.value?.performances ?? [])
const only = computed(() => (dates.value.length === 1 && dates.value[0]!.state === 'scheduled' ? dates.value[0] : null))
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
  <UContainer v-if="production">
    <UPage>
      <!-- Without a poster the text takes the whole width rather than leaving an empty column. -->
      <div :class="['grid gap-8 py-8', production.poster ? 'md:grid-cols-[minmax(0,18rem)_1fr]' : 'max-w-3xl']">
        <div v-if="production.poster">
          <img
            :src="production.poster.url"
            :alt="production.poster.alt"
            :width="production.poster.width ?? undefined"
            :height="production.poster.height ?? undefined"
            class="aspect-[2/3] w-full rounded-lg border border-default object-cover"
          >
        </div>

        <div class="min-w-0 space-y-6">
          <header class="space-y-2">
            <p
              v-if="eyebrow"
              class="text-sm text-muted"
            >
              {{ eyebrow }}
            </p>
            <h1 class="text-3xl font-bold text-highlighted sm:text-4xl">
              {{ production.title }}
            </h1>
            <p
              v-if="production.subtitle"
              class="text-lg"
            >
              {{ production.subtitle }}
            </p>
            <UBadge
              v-if="production.state === 'cancelled'"
              color="error"
              variant="subtle"
              :label="t('public-site.production.cancelled')"
            />
            <MarkdownText
              v-if="production.summary"
              :text="production.summary"
            />
            <p
              v-if="production.companyName"
              class="text-sm text-muted"
            >
              {{ t('public-site.production.presented-by', { company: production.companyName }) }}
            </p>
            <p
              v-if="facts"
              class="text-sm text-muted"
            >
              {{ facts }}
            </p>
            <PublicSiteBookingButton
              v-if="only"
              :booking="only.booking"
              :when="dateTime(only.startsAt)"
              size="lg"
              class="justify-start pt-2"
            />
          </header>

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

          <UCollapsible
            v-if="production.advisories.length || production.contentNote"
            class="rounded-lg border border-default"
          >
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-between px-4 py-3"
              trailing-icon="i-lucide-chevron-down"
              :label="t('public-site.production.advisories', { count: production.advisories.length })"
            />
            <template #content>
              <div class="space-y-2 px-4 pb-4">
                <ul class="space-y-2">
                  <li
                    v-for="a in production.advisories"
                    :key="a.termId"
                  >
                    <details v-if="a.detail">
                      <summary class="cursor-pointer">
                        <span class="font-medium">{{ a.label }}</span><span v-if="a.level"> · {{ t(`public-site.production.level-${a.level}`) }}</span>
                      </summary>
                      <p class="mt-1 text-sm text-muted">
                        {{ a.detail }}
                      </p>
                    </details>
                    <template v-else>
                      <span class="font-medium">{{ a.label }}</span><span v-if="a.level"> · {{ t(`public-site.production.level-${a.level}`) }}</span>
                    </template>
                  </li>
                </ul>
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

          <section
            v-if="dates.length"
            aria-labelledby="dates-heading"
          >
            <h2
              id="dates-heading"
              class="mb-2 text-lg font-semibold text-highlighted"
            >
              {{ t('public-site.production.dates') }}
            </h2>
            <p
              v-if="production.price"
              class="mb-2 text-sm"
            >
              {{ priceSummary(production.price, t) }}
            </p>
            <ul class="divide-y divide-default border-y border-default">
              <li
                v-for="p in dates"
                :key="p.id"
                class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
              >
                <div class="min-w-0 space-y-1">
                  <p :class="p.state === 'cancelled' ? 'text-muted line-through' : 'font-medium'">
                    <time :datetime="new Date(p.startsAt).toISOString()">{{ dateTime(p.startsAt) }}</time>
                    <span v-if="p.label"> · {{ p.label }}</span>
                  </p>
                  <p
                    v-if="where(p) || (p.doorsAt && p.state === 'scheduled')"
                    class="text-sm text-muted"
                  >
                    {{ [where(p), p.doorsAt && p.state === 'scheduled' ? t('public-site.production.doors', { time: time(p.doorsAt) }) : ''].filter(Boolean).join(' · ') }}
                  </p>
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
                <PublicSiteBookingButton
                  v-else-if="p.state === 'scheduled'"
                  :booking="p.booking"
                  :when="dateTime(p.startsAt)"
                />
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
              <dl class="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
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
</template>
