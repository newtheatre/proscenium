<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

const { data: show, status, error } = await useFetch(`/api/whats-on/${slug}`, {
  key: `whats-on-${slug}`,
})

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode ?? 404,
    statusMessage: 'Show not found',
    fatal: true,
  })
}

useSeoMeta({
  title: () => show.value?.title ?? 'Show',
  description: () => show.value?.description?.substring(0, 160) ?? '',
  ogImage: () => show.value?.posterUrl ?? undefined,
})

const router = useRouter()

function handlePerformanceSelect(performanceId: string) {
  router.push({
    path: `/whats-on/${slug}/book`,
    query: { performance: performanceId },
  })
}

// Compute the price range across all performances
const priceRange = computed(() => {
  if (!show.value) return null

  const prices = show.value.performances
    .flatMap(p => p.ticketTypes?.map(t => t.effectivePrice) ?? [])
    .filter(p => p != null)

  if (prices.length === 0) return null

  const min = Math.min(...prices)
  const max = Math.max(...prices)

  const format = (p: number) => {
    if (p === 0) return 'Free'
    return `£${(p / 100).toFixed(2)}`
  }

  if (min === max) return format(min)
  return `${format(min)} – ${format(max)}`
})

const hasAvailablePerformances = computed(() => {
  return show.value?.performances.some(p => !p.isSoldOut) ?? false
})
</script>

<template>
  <UContainer class="py-8 lg:py-12">
    <!-- Loading -->
    <div
      v-if="status === 'pending'"
      class="space-y-6"
    >
      <div class="grid md:grid-cols-3 gap-6">
        <USkeleton class="aspect-3/4 rounded-xl" />
        <div class="md:col-span-2 space-y-4 py-8">
          <USkeleton class="h-10 w-2/3" />
          <USkeleton class="h-6 w-1/3" />
          <USkeleton class="h-24 w-full" />
        </div>
      </div>
    </div>

    <template v-else-if="show">
      <!-- Breadcrumb -->
      <UBreadcrumb
        :items="[
          { label: 'What\'s On', to: '/whats-on' },
          { label: show.title },
        ]"
        class="mb-6"
      />

      <!-- Hero -->
      <WhatsOnShowHero :show="show">
        <template #actions>
          <div class="flex flex-wrap items-center gap-4">
            <div
              v-if="priceRange"
              class="text-lg font-semibold text-default"
            >
              {{ priceRange }}
            </div>

            <UButton
              v-if="hasAvailablePerformances"
              label="Book Tickets"
              icon="i-lucide-ticket"
              size="lg"
              :to="`/whats-on/${slug}/book`"
            />

            <UBadge
              v-else
              label="Sold Out"
              color="error"
              size="lg"
            />
          </div>
        </template>
      </WhatsOnShowHero>

      <!-- Performances Section -->
      <div class="mt-10">
        <h2 class="text-2xl font-bold text-default mb-6">
          Performances
        </h2>

        <WhatsOnPerformanceList
          :performances="show.performances"
          :show-slug="slug"
          @select="handlePerformanceSelect"
        />
      </div>

      <!-- Show Info Cards -->
      <div
        v-if="show.performances.length > 0"
        class="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <!-- Ticket Prices -->
        <WhatsOnInfoCard
          icon="i-lucide-ticket"
          title="Ticket Prices"
        >
          <div class="space-y-1">
            <div
              v-for="ticketType in show.performances[0]?.ticketTypes ?? []"
              :key="ticketType.id"
              class="flex justify-between text-sm"
            >
              <span class="text-muted">{{ ticketType.name }}</span>
              <span class="font-medium text-default">
                {{ ticketType.effectivePrice === 0 ? 'Free' : `£${(ticketType.effectivePrice / 100).toFixed(2)}` }}
              </span>
            </div>
          </div>
        </WhatsOnInfoCard>

        <!-- Venue -->
        <WhatsOnInfoCard
          icon="i-lucide-map-pin"
          title="Venue"
        >
          <div class="space-y-1">
            <p class="font-medium text-default">
              {{ show.performances[0]?.venue.name }}
            </p>
            <p
              v-if="show.performances[0]?.venue.address"
              class="text-sm text-muted"
            >
              {{ show.performances[0]?.venue.address }}
            </p>
          </div>
        </WhatsOnInfoCard>

        <!-- Duration -->
        <WhatsOnInfoCard
          v-if="show.performances[0]?.durationMinutes"
          icon="i-lucide-clock"
          title="Duration"
        >
          <p class="text-default">
            {{ Math.floor(show.performances[0].durationMinutes / 60) }}h {{ show.performances[0].durationMinutes % 60 }}m
            <span v-if="show.performances[0].intervalCount > 0">
              (incl. {{ show.performances[0].intervalCount }} interval{{ show.performances[0].intervalCount > 1 ? 's' : '' }})
            </span>
          </p>
        </WhatsOnInfoCard>
      </div>
    </template>
  </UContainer>
</template>
