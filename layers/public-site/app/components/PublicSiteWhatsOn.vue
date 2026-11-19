<!-- What's on, for a theatre's own pages: ::whats-on in a content file (part 5, public components).
     Every prop is optional: `limit` shows only the soonest few, with a link to the whole list;
     `category`, `season` and `venue` take slugs; `layout` is "grid" (the default) or "list".
     With nothing to list, or the public site still off on a new site, it says nothing is on sale
     yet, so the page's own "What's on" heading never stands empty. -->
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
const props = defineProps<{
  limit?: number | string
  category?: string
  season?: string
  venue?: string
  layout?: 'grid' | 'list'
}>()
const { t } = useT()
const { span } = useDates()
const query = computed(() => Object.fromEntries(Object.entries({ limit: props.limit, category: props.category, season: props.season, venue: props.venue }).filter(([, v]) => v !== undefined && v !== '')))
const key = computed(() => `public-site:whats-on-component:${JSON.stringify(query.value)}`)
// The public site being off answers "not found"; the component then says only that nothing is on sale.
const { data } = await useAPI<{ productions: Listing[] }>('/api/public-site/productions', { key: key.value, query })
const productions = computed(() => data.value?.productions ?? [])
const limited = computed(() => props.limit !== undefined && productions.value.length >= Number(props.limit))
const list = computed(() => props.layout === 'list')
</script>

<template>
  <div class="not-prose">
    <ul
      v-if="productions.length"
      :class="list ? 'grid gap-4' : 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3'"
    >
      <li
        v-for="p in productions"
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
          :orientation="list ? 'horizontal' : 'vertical'"
        />
      </li>
    </ul>
    <p
      v-else
      class="text-muted"
    >
      {{ t('public-site.whats-on.nothing-on-sale') }}
    </p>
    <UButton
      v-if="limited"
      to="/whats-on"
      :label="t('public-site.whats-on.see-all')"
      trailing-icon="i-lucide-arrow-right"
      color="neutral"
      variant="link"
      class="mt-4 px-0"
    />
  </div>
</template>
