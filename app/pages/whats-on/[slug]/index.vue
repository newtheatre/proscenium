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
  ogImage: () => show.value?.posterUrl ? `/images/${show.value.posterUrl}` : undefined,
})

const router = useRouter()

function handlePerformanceSelect(performanceId: string) {
  router.push({
    path: `/whats-on/${slug}/book`,
    query: { performance: performanceId },
  })
}

const hasAvailablePerformances = computed(() => {
  return show.value?.performances.some(p => !p.isSoldOut) ?? false
})

const firstPerformance = computed(() => show.value?.performances[0] ?? null)

function formatPrice(pence: number): string {
  if (pence === 0) return 'Free'
  return `£${(pence / 100).toFixed(2)}`
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
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
            <!--
            externalUrl marks a show the theatre hosts but does not sell for, so the
            booking flow must not be offered.
            -->
            <UButton
              v-if="show.externalUrl"
              label="Book on the organiser's site"
              icon="i-lucide-external-link"
              size="lg"
              :to="show.externalUrl"
              target="_blank"
              rel="noopener noreferrer"
              external
            />

            <UButton
              v-else-if="hasAvailablePerformances"
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

            <UButton
              v-if="show.programmeUrl"
              label="Digital programme"
              icon="i-lucide-book-open"
              size="lg"
              color="neutral"
              variant="subtle"
              :to="show.programmeUrl"
              target="_blank"
              rel="noopener noreferrer"
              external
            />
          </div>
        </template>
      </WhatsOnShowHero>

      <!-- Main content with sidebar -->
      <UPage>
        <UPageBody>
          <!-- The legacy site carried a long description as well as the card
               blurb; 403 of 477 imported shows have one. -->
          <section
            v-if="show.longDescription"
            class="mb-10"
          >
            <h2 class="text-2xl font-bold text-default mb-4">
              About the show
            </h2>
            <div class="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line">
              {{ show.longDescription }}
            </div>
          </section>

          <WhatsOnContentWarnings
            :warnings="show.contentWarnings ?? []"
            :notes="show.contentWarningNotes"
            :confirmed-none="show.warningsConfirmedNone"
            class="mb-10"
          />

          <!-- Performances Section -->
          <h2 class="text-2xl font-bold text-default mb-6">
            Performances
          </h2>

          <WhatsOnPerformanceList
            :performances="show.performances"
            :show-slug="slug"
            @select="handlePerformanceSelect"
          />
        </UPageBody>

        <template #right>
          <UPageAside>
            <div class="space-y-5">
              <!-- Ticket Prices -->
              <div v-if="firstPerformance?.ticketTypes?.length">
                <h4 class="flex items-center gap-2 text-sm font-semibold text-default mb-3">
                  <UIcon
                    name="i-lucide-ticket"
                    class="size-4 text-primary"
                  />
                  Ticket Prices
                </h4>
                <div class="space-y-2">
                  <div
                    v-for="ticketType in firstPerformance.ticketTypes"
                    :key="ticketType.id"
                    class="flex justify-between text-sm"
                  >
                    <span class="text-muted">{{ ticketType.name }}</span>
                    <span class="font-medium text-default">{{ formatPrice(ticketType.effectivePrice) }}</span>
                  </div>
                </div>
              </div>

              <USeparator v-if="firstPerformance?.ticketTypes?.length" />

              <!-- Venue -->
              <div v-if="firstPerformance">
                <h4 class="flex items-center gap-2 text-sm font-semibold text-default mb-3">
                  <UIcon
                    name="i-lucide-map-pin"
                    class="size-4 text-primary"
                  />
                  Venue
                </h4>
                <p class="text-sm font-medium text-default">
                  {{ firstPerformance.venue.name }}
                </p>
                <p
                  v-if="firstPerformance.venue.address"
                  class="text-sm text-muted mt-0.5"
                >
                  {{ firstPerformance.venue.address }}
                </p>
              </div>

              <USeparator v-if="firstPerformance?.durationMinutes" />

              <!-- Duration -->
              <div v-if="firstPerformance?.durationMinutes">
                <h4 class="flex items-center gap-2 text-sm font-semibold text-default mb-3">
                  <UIcon
                    name="i-lucide-clock"
                    class="size-4 text-primary"
                  />
                  Duration
                </h4>
                <p class="text-sm text-default">
                  {{ formatDuration(firstPerformance.durationMinutes) }}
                  <span
                    v-if="firstPerformance.intervalCount > 0"
                    class="text-muted"
                  >
                    (incl. {{ firstPerformance.intervalCount }} interval{{ firstPerformance.intervalCount > 1 ? 's' : '' }})
                  </span>
                </p>
              </div>

              <USeparator />

              <!-- Book CTA -->
              <UButton
                v-if="show.externalUrl"
                label="Book on the organiser's site"
                icon="i-lucide-external-link"
                block
                :to="show.externalUrl"
                target="_blank"
                rel="noopener noreferrer"
                external
              />
              <UButton
                v-else-if="hasAvailablePerformances"
                label="Book Tickets"
                icon="i-lucide-ticket"
                block
                :to="`/whats-on/${slug}/book`"
              />
              <UBadge
                v-else
                label="Sold Out"
                color="error"
                variant="subtle"
                size="lg"
                class="w-full justify-center"
              />
            </div>
          </UPageAside>
        </template>
      </UPage>
    </template>
  </UContainer>
</template>
