<!-- What's on (C-38): published, listed productions with a scheduled performance still to come,
     soonest first. Each card links to the production's page. It works with scripts off. -->
<script setup lang="ts">
interface Listing {
  id: string
  slug: string
  title: string
  subtitle: string | null
  summary: string | null
  category: { label: string } | null
  nextStartsAt: number
  lastEndsAt: number
  venues: string[]
  poster: { url: string, alt: string, width: number | null, height: number | null } | null
}
const { t } = useT()
const { range } = useDates()
const { data } = await useAPI<{ productions: Listing[] }>('/api/public-site/productions', { key: 'public-site:whats-on' })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.whats-on.not-found'), fatal: true })
useSeoMeta({ title: () => t('public-site.whats-on.title'), description: () => t('public-site.whats-on.description') })
const productions = computed(() => data.value?.productions ?? [])
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('public-site.whats-on.title')"
        :description="t('public-site.whats-on.description')"
      />
      <UPageBody>
        <ul
          v-if="productions.length"
          class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <li
            v-for="p in productions"
            :key="p.id"
          >
            <UPageCard
              :to="`/whats-on/${p.slug}`"
              :title="p.title"
              :description="p.summary ?? p.subtitle ?? undefined"
              variant="outline"
              class="h-full"
            >
              <template
                v-if="p.poster"
                #header
              >
                <img
                  :src="p.poster.url"
                  :alt="p.poster.alt"
                  :width="p.poster.width ?? undefined"
                  :height="p.poster.height ?? undefined"
                  loading="lazy"
                  class="aspect-[2/3] w-full rounded-md object-cover"
                >
              </template>
              <template #footer>
                <p class="text-sm font-medium">
                  {{ range(p.nextStartsAt, p.lastEndsAt) }}
                </p>
                <p class="text-sm text-muted">
                  {{ [p.venues.join(', '), p.category?.label].filter(Boolean).join(' · ') }}
                </p>
              </template>
            </UPageCard>
          </li>
        </ul>
        <EmptyState
          v-else
          icon="i-lucide-calendar"
          :title="t('public-site.whats-on.empty')"
          :description="t('public-site.whats-on.empty-description')"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
