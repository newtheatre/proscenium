<!-- The archive of past shows (C-43): one year at a time, newest first, with a link to each year that
     has any, and a search across titles, companies and public credits. It is an ordinary form and
     ordinary links, so it works with scripts off. -->
<script setup lang="ts">
interface Entry {
  id: string
  slug: string
  title: string
  subtitle: string | null
  companyName: string | null
  category: { label: string } | null
  openedAt: number
  closedAt: number
  cancelled: boolean
  venues: string[]
  poster: { url: string, alt: string, width: number | null, height: number | null } | null
}
interface Archive {
  years: { year: number, count: number }[]
  year: number | null
  words: string[]
  searchTooShort: boolean
  productions: Entry[]
}
const { t } = useT()
const { range } = useDates()
const route = useRoute()
const year = computed(() => (typeof route.query.year === 'string' ? route.query.year : undefined))
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : undefined))
const { data } = await useAPI<Archive>('/api/public-site/archive', { key: 'public-site:archive', query: { year, q }, watch: [year, q] })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.whats-on.not-found'), fatal: true })
useSeoMeta({ title: () => t('public-site.archive.title'), description: () => t('public-site.archive.description') })

const searching = computed(() => (data.value?.words.length ?? 0) > 0)
const heading = computed(() => (searching.value
  ? t('public-site.archive.results', { count: data.value!.productions.length, q: q.value ?? '' })
  : data.value?.year ? String(data.value.year) : ''))
const years = computed(() => (data.value?.years ?? []).map(y => ({
  label: String(y.year),
  to: { path: '/shows', query: { year: y.year } },
  active: !searching.value && y.year === data.value?.year,
  ariaLabel: t('public-site.archive.year-link', { year: y.year, count: y.count }),
})))

// With scripts on the search stays in the page; with them off the form sends the same query itself.
const search = reactive({ q: q.value ?? '' })
watch(q, value => (search.q = value ?? ''))
const find = () => navigateTo({ path: '/shows', query: search.q.trim() ? { q: search.q.trim() } : {} })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('public-site.archive.title')"
        :description="t('public-site.archive.description')"
      />
      <UPageBody>
        <UForm
          :state="search"
          action="/shows"
          method="get"
          role="search"
          class="flex flex-wrap items-end gap-2"
          novalidate
          @submit="find"
        >
          <UFormField
            :label="t('public-site.archive.search')"
            name="q"
            :help="data?.searchTooShort ? t('public-site.archive.too-short') : undefined"
          >
            <UInput
              v-model="search.q"
              name="q"
              type="search"
              icon="i-lucide-search"
              class="min-w-64"
            />
          </UFormField>
          <UButton
            type="submit"
            :label="t('public-site.archive.find')"
          />
          <UButton
            v-if="searching"
            to="/shows"
            color="neutral"
            variant="link"
            :label="t('public-site.archive.clear')"
          />
        </UForm>

        <nav
          v-if="years.length"
          :aria-label="t('public-site.archive.years')"
          class="mt-6"
        >
          <ul class="flex flex-wrap gap-1">
            <li
              v-for="y in years"
              :key="y.label"
            >
              <UButton
                :to="y.to"
                :label="y.label"
                :aria-label="y.ariaLabel"
                :aria-current="y.active ? 'page' : undefined"
                color="neutral"
                :variant="y.active ? 'solid' : 'ghost'"
                size="sm"
              />
            </li>
          </ul>
        </nav>

        <section
          v-if="data?.productions.length"
          aria-labelledby="archive-heading"
          class="mt-8"
        >
          <h2
            id="archive-heading"
            class="mb-4 text-xl font-semibold"
          >
            {{ heading }}
          </h2>
          <ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <li
              v-for="p in data.productions"
              :key="p.id"
            >
              <PublicSiteShowCard
                :to="`/shows/${p.slug}`"
                :title="p.title"
                :description="p.subtitle ?? (p.companyName ? t('public-site.production.presented-by', { company: p.companyName }) : undefined)"
                :poster="p.poster"
                :when="range(p.openedAt, p.closedAt)"
                :details="[p.venues.join(', '), p.category?.label].filter(Boolean).join(' · ')"
                :cancelled="p.cancelled"
              />
            </li>
          </ul>
        </section>
        <EmptyState
          v-else
          class="mt-8"
          :icon="searching ? 'i-lucide-search-x' : 'i-lucide-archive'"
          :title="searching ? t('public-site.archive.no-results') : t('public-site.archive.empty')"
          :description="searching ? t('public-site.archive.no-results-description') : t('public-site.archive.empty-description')"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
