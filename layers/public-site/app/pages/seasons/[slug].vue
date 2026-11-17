<!-- A season's public page (part 6): its dates and summary, then its productions in the order they
     open, each linking to the address it has now: /whats-on while current, /shows once past. -->
<script setup lang="ts">
interface Production {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  category: { label: string } | null
  firstStartsAt: number | null
  lastEndsAt: number | null
  cancelled: boolean
  past: boolean
  poster: { url: string, alt: string, width: number | null, height: number | null } | null
}
interface Season {
  id: string
  slug: string
  name: string
  startsOn: string
  endsOn: string
  summary: string | null
  archived: boolean
  productions: Production[]
}

const { t } = useT()
const { range } = useDates()
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data } = await useAPI<Season>(() => `/api/public-site/seasons/${encodeURIComponent(slug.value)}`, { key: `public-site:season:${slug.value}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.season.not-found'), fatal: true })
const season = computed(() => data.value!)

useSeoMeta({
  title: () => season.value.name,
  description: () => markdownText(season.value.summary) || undefined,
})
// The origin is read here, during setup: inside the head callback the request is no longer to hand.
const origin = useRequestURL().origin
useHead(() => ({
  link: [{ key: 'canonical', rel: 'canonical', href: new URL(`/seasons/${season.value.slug}`, origin).toString() }],
}))
</script>

<template>
  <UContainer v-if="data">
    <UPage>
      <UPageHeader
        :title="season.name"
        :description="range(season.startsOn, season.endsOn)"
      />
      <UPageBody>
        <MarkdownText
          v-if="season.summary"
          :text="season.summary"
          class="mb-8 max-w-3xl"
        />
        <ul
          v-if="season.productions.length"
          class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <li
            v-for="p in season.productions"
            :key="p.id"
          >
            <PublicSiteShowCard
              :to="`/${p.past ? 'shows' : 'whats-on'}/${p.slug}`"
              :title="p.title"
              :description="markdownText(p.summary) || p.subtitle"
              :poster="p.poster"
              :when="p.firstStartsAt && p.lastEndsAt ? range(p.firstStartsAt, p.lastEndsAt) : t('public-site.season.dates-soon')"
              :details="p.category?.label"
              :cancelled="p.cancelled"
            />
          </li>
        </ul>
        <EmptyState
          v-else
          icon="i-lucide-calendar"
          :title="t('public-site.season.empty')"
          :description="t('public-site.season.empty-description')"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
