<!-- A collection's public page (C-60): its lead, image and page, then its productions in its own
     order, current first and past after. An archived collection says it has ended. -->
<script setup lang="ts">
interface Production {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  category: { label: string } | null
  firstStartsAt: number | null
  lastStartsAt: number | null
  past: boolean
  poster: { url: string, alt: string, width: number | null, height: number | null } | null
  age: string | null
  hasEffects: boolean
  hasWarnings: boolean
}
interface Collection {
  id: string
  slug: string
  name: string
  summary: string | null
  description: string | null
  colour: string
  image: { url: string, alt: string, width: number | null, height: number | null } | null
  archived: boolean
  productions: Production[]
}

const { t } = useT()
const { span } = useDates()
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data } = await useAPI<Collection | { moved: string }>(() => `/api/public-site/collections/${encodeURIComponent(slug.value)}`, { key: `public-site:collection:${slug.value}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.collection.not-found'), fatal: true })
if ('moved' in data.value) await navigateTo(`/collections/${data.value.moved}`, { replace: true, redirectCode: 301 })
const collection = computed(() => (data.value && !('moved' in data.value) ? data.value : null))
const current = computed(() => collection.value?.productions.filter(p => !p.past) ?? [])
const past = computed(() => collection.value?.productions.filter(p => p.past) ?? [])

useSeoMeta({
  title: () => collection.value?.name ?? '',
  description: () => markdownText(collection.value?.summary) || undefined,
  ogImage: () => collection.value?.image?.url,
})
const origin = useRequestURL().origin
useHead(() => ({
  link: collection.value ? [{ key: 'canonical', rel: 'canonical', href: new URL(`/collections/${collection.value.slug}`, origin).toString() }] : [],
}))
</script>

<template>
  <PageFrame
    v-if="collection"
    :title="collection.name"
    :description="collection.summary ?? undefined"
    width="full"
  >
    <div class="space-y-8">
      <UAlert
        v-if="collection.archived"
        color="neutral"
        icon="i-lucide-archive"
        :title="t('public-site.collection.ended')"
      />
      <div
        v-if="collection.image || collection.description"
        class="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <img
          v-if="collection.image"
          :src="collection.image.url"
          :alt="collection.image.alt"
          :width="collection.image.width ?? undefined"
          :height="collection.image.height ?? undefined"
          class="w-full rounded-md object-cover"
        >
        <MarkdownText
          v-if="collection.description"
          :text="collection.description"
          class="max-w-3xl"
        />
      </div>

      <section
        v-if="current.length"
        aria-labelledby="collection-current"
        class="space-y-4"
      >
        <h2
          id="collection-current"
          class="text-lg font-semibold text-highlighted"
        >
          {{ t('public-site.collection.on-now') }}
        </h2>
        <ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="p in current"
            :key="p.id"
          >
            <PublicSiteShowCard
              :to="`/whats-on/${p.slug}`"
              :title="p.title"
              :description="markdownText(p.summary) || p.subtitle"
              :poster="p.poster"
              :when="p.firstStartsAt && p.lastStartsAt ? span(p.firstStartsAt, p.lastStartsAt) : t('public-site.season.dates-soon')"
              :details="p.category?.label"
              :age="p.age"
              :effects="p.hasEffects"
              :warnings="p.hasWarnings"
            />
          </li>
        </ul>
      </section>

      <section
        v-if="past.length"
        aria-labelledby="collection-past"
        class="space-y-4"
      >
        <h2
          id="collection-past"
          class="text-lg font-semibold text-highlighted"
        >
          {{ t('public-site.collection.past') }}
        </h2>
        <ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="p in past"
            :key="p.id"
          >
            <PublicSiteShowCard
              :to="`/shows/${p.slug}`"
              :title="p.title"
              :description="markdownText(p.summary) || p.subtitle"
              :poster="p.poster"
              :when="p.firstStartsAt && p.lastStartsAt ? span(p.firstStartsAt, p.lastStartsAt) : ''"
              :details="p.category?.label"
              :age="p.age"
              :effects="p.hasEffects"
              :warnings="p.hasWarnings"
            />
          </li>
        </ul>
      </section>

      <EmptyState
        v-if="!collection.productions.length"
        icon="i-lucide-library"
        :title="t('public-site.season.empty')"
        :description="t('public-site.season.empty-description')"
      />
    </div>
  </PageFrame>
</template>
