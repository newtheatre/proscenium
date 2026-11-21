<!-- What's on (C-38): published, listed productions with a scheduled performance still to come,
     soonest first, filtered by category, season, venue and month. Unfiltered, the soonest show is billed
     at the top with its next dates (PublicSiteSpotlight); the rest follow under the month they next
     play. Each card links to the production's page. The filters are ordinary links, so the page works
     with scripts off. -->
<script setup lang="ts">
interface Listing {
  id: string
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
  lastEndsAt: number
  venues: string[]
  poster: { url: string, alt: string, width: number | null, height: number | null } | null
  price: PriceSummaryView | null
}
interface Filters {
  categories: { slug: string, label: string }[]
  seasons: { slug: string, name: string }[]
  venues: { slug: string, name: string }[]
  months: string[]
}
type Key = 'category' | 'season' | 'venue' | 'month'

const { t } = useT()
const { span, monthYear, toLocal } = useDates()
const route = useRoute()
const chosen = computed(() => Object.fromEntries((['category', 'season', 'venue', 'month'] as Key[])
  .map(k => [k, typeof route.query[k] === 'string' ? route.query[k] : undefined])
  .filter(([, v]) => v)) as Partial<Record<Key, string>>)
const [{ data }, { data: filters }] = await Promise.all([
  useAPI<{ productions: Listing[] }>('/api/public-site/productions', { key: 'public-site:whats-on', query: chosen, watch: [chosen] }),
  useAPI<Filters>('/api/public-site/whats-on-filters', { key: 'public-site:whats-on-filters' }),
])
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.whats-on.not-found'), fatal: true })
useSeoMeta({ title: () => t('public-site.whats-on.title'), description: () => t('public-site.whats-on.description') })
const productions = computed(() => data.value?.productions ?? [])
const filtered = computed(() => Object.keys(chosen.value).length > 0)
// The soonest show takes the spotlight while nothing is filtered; every other show sits under its month.
const spotlight = computed(() => (filtered.value ? null : productions.value[0] ?? null))
const months = computed(() => {
  const groups = new Map<string, Listing[]>()
  for (const p of productions.value) {
    if (p === spotlight.value) continue
    const month = toLocal(p.nextStartsAt).slice(0, 7) // not-policy: the year and month of a local date
    groups.set(month, [...(groups.get(month) ?? []), p])
  }
  return [...groups.entries()].map(([month, shows]) => ({ month, label: monthYear(`${month}-01`), shows }))
})

// A group shows only when it offers a real choice. Each option keeps the other filters as they are.
const link = (key: Key, value: string | undefined) => ({ path: '/whats-on', query: { ...chosen.value, [key]: value } })
const groups = computed(() => {
  const f = filters.value
  if (!f) return []
  const all: { key: Key, label: string, options: { value: string, label: string }[] }[] = [
    { key: 'category', label: t('public-site.whats-on.filter-category'), options: f.categories.map(c => ({ value: c.slug, label: c.label })) },
    { key: 'season', label: t('public-site.whats-on.filter-season'), options: f.seasons.map(s => ({ value: s.slug, label: s.name })) },
    { key: 'venue', label: t('public-site.whats-on.filter-venue'), options: f.venues.map(v => ({ value: v.slug, label: v.name })) },
    { key: 'month', label: t('public-site.whats-on.filter-month'), options: f.months.map(m => ({ value: m, label: monthYear(`${m}-01`) })) },
  ]
  return all.filter(g => g.options.length > 1 || chosen.value[g.key])
})
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('public-site.whats-on.title')"
        :description="t('public-site.whats-on.description')"
      />
      <UPageBody>
        <PublicSiteSpotlight
          v-if="spotlight"
          :show="spotlight"
          class="mb-8"
        />
        <nav
          v-if="groups.length"
          :aria-label="t('public-site.whats-on.filters')"
          class="mb-8 grid gap-3"
        >
          <div
            v-for="g in groups"
            :key="g.key"
            class="flex flex-wrap items-center gap-1"
          >
            <span
              :id="`filter-${g.key}`"
              class="me-2 w-20 text-sm font-medium"
            >{{ g.label }}</span>
            <ul
              :aria-labelledby="`filter-${g.key}`"
              class="flex flex-wrap gap-1"
            >
              <li>
                <UButton
                  :to="link(g.key, undefined)"
                  :label="t('public-site.whats-on.filter-any')"
                  :aria-current="!chosen[g.key] ? 'true' : undefined"
                  color="neutral"
                  :variant="!chosen[g.key] ? 'solid' : 'ghost'"
                />
              </li>
              <li
                v-for="o in g.options"
                :key="o.value"
              >
                <UButton
                  :to="link(g.key, o.value)"
                  :label="o.label"
                  :aria-current="chosen[g.key] === o.value ? 'true' : undefined"
                  color="neutral"
                  :variant="chosen[g.key] === o.value ? 'solid' : 'ghost'"
                />
              </li>
            </ul>
          </div>
        </nav>
        <template v-if="productions.length">
          <section
            v-for="m in months"
            :key="m.month"
            :aria-labelledby="`month-${m.month}`"
            class="mb-10"
          >
            <div class="mb-4 flex items-baseline gap-3">
              <h2
                :id="`month-${m.month}`"
                class="text-2xl font-bold text-highlighted"
              >
                {{ m.label }}
              </h2>
              <span class="text-sm text-muted">{{ t('public-site.whats-on.month-count', { count: m.shows.length }) }}</span>
            </div>
            <ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <li
                v-for="p in m.shows"
                :key="p.id"
              >
                <PublicSiteShowCard
                  :to="`/whats-on/${p.slug}`"
                  :title="p.title"
                  :description="markdownText(p.summary) || p.subtitle"
                  :poster="p.poster"
                  :price="p.price"
                  :when="span(p.nextStartsAt, p.lastStartsAt)"
                  :age="p.age"
                  :effects="p.hasEffects"
                  :warnings="p.hasWarnings"
                  :details="[p.venues.join(', '), p.category?.label].filter(Boolean).join(' · ')"
                />
              </li>
            </ul>
          </section>
        </template>
        <EmptyState
          v-else
          icon="i-lucide-calendar"
          :title="filtered ? t('public-site.whats-on.none-match') : t('public-site.whats-on.empty')"
          :description="filtered ? t('public-site.whats-on.none-match-description') : t('public-site.whats-on.empty-description')"
        >
          <template
            v-if="filtered"
            #actions
          >
            <UButton
              to="/whats-on"
              :label="t('public-site.whats-on.clear-filters')"
              color="neutral"
              variant="outline"
            />
          </template>
        </EmptyState>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
