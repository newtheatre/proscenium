<!-- The venues index (/venues): every venue audiences go to, with its address and its own access
     features, each opening the venue's page. -->
<script setup lang="ts">
interface Venue {
  id: string
  slug: string
  name: string
  address: { lines: string[], locality: string | null, postcode: string | null, country: string | null }
  access: { termId: string, label: string, icon: string | null, note: string | null }[]
}

const { t } = useT()
const { data } = await useAPI<{ venues: Venue[] }>('/api/public-site/venues', { key: 'public-site:venues' })
if (!data.value) throw createError({ statusCode: 404, statusMessage: t('public-site.venue.not-found'), fatal: true })
const venues = computed(() => data.value?.venues ?? [])
const addressOf = (v: Venue) => [...v.address.lines, [v.address.locality, v.address.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
useSeoMeta({ title: () => t('public-site.venues.title'), description: () => t('public-site.venues.description') })
</script>

<template>
  <PageFrame
    :title="t('public-site.venues.title')"
    :description="t('public-site.venues.description')"
  >
    <ul
      v-if="venues.length"
      class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li
        v-for="v in venues"
        :key="v.id"
      >
        <UPageCard
          :to="`/venues/${v.slug}`"
          :title="v.name"
          :description="addressOf(v) || undefined"
          variant="outline"
          class="h-full"
        >
          <template
            v-if="v.access.length"
            #footer
          >
            <ul
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
          </template>
        </UPageCard>
      </li>
    </ul>
    <EmptyState
      v-else
      :title="t('public-site.venues.empty')"
      icon="i-lucide-map-pin"
    />
  </PageFrame>
</template>
