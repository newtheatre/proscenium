<!-- Front of house tonight (Front of house specification, part 5, "Live mode"): today's performances
     this person may open, one large button each, then reporting an incident and the emergency cards. -->
<script setup lang="ts">
interface Tonight {
  performances: { id: string, show: string, startsAt: number, venueId: string | null, venue: string | null, last: string | null, expected: number, arrived: number }[]
  mayReport: boolean
  cards: { venueId: string, venueName: string }[]
}
const { t } = useT()
const { time } = useDates()
const { data, status, error, refresh } = await useAPI<Tonight>('/api/front-of-house/tonight', { key: 'front-of-house:tonight' })
</script>

<template>
  <PageLive :title="t('front-of-house.live.title')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mx-auto max-w-3xl space-y-8">
          <section aria-labelledby="fh-tonight-performances">
            <h2
              id="fh-tonight-performances"
              class="mb-3 text-sm font-semibold text-muted"
            >
              {{ t('front-of-house.live.performances') }}
            </h2>
            <ul
              v-if="d.performances.length"
              class="space-y-3"
            >
              <li
                v-for="p in d.performances"
                :key="p.id"
              >
                <UButton
                  :to="`/live/front-of-house/${encodeURIComponent(p.id)}`"
                  color="neutral"
                  variant="outline"
                  size="xl"
                  block
                  trailing-icon="i-lucide-chevron-right"
                  class="min-h-20 justify-between text-start"
                >
                  <span class="flex flex-col">
                    <span class="text-lg font-semibold">{{ p.show }}</span>
                    <span class="text-sm text-muted">{{ [time(p.startsAt), p.venue].filter(Boolean).join(' · ') }}</span>
                    <span class="text-sm">{{ [p.last ? t(`front-of-house.timings.${p.last}`) : t('front-of-house.live.not-open-yet'), p.expected ? t('front-of-house.live.arrived-of', { arrived: p.arrived, expected: p.expected }) : null].filter(Boolean).join(' · ') }}</span>
                  </span>
                </UButton>
              </li>
            </ul>
            <EmptyState
              v-else
              icon="i-lucide-moon"
              :title="t('front-of-house.live.none.title')"
              :description="t('front-of-house.live.none.description')"
            />
          </section>

          <div
            v-if="d.mayReport"
            class="grid"
          >
            <UButton
              to="/live/front-of-house/incident"
              icon="i-lucide-shield-alert"
              color="warning"
              size="xl"
              block
              :label="t('front-of-house.live.report-incident')"
            />
          </div>

          <section
            v-if="d.cards.length"
            aria-labelledby="fh-tonight-cards"
          >
            <h2
              id="fh-tonight-cards"
              class="mb-3 text-sm font-semibold text-muted"
            >
              {{ t('front-of-house.live.emergency-cards') }}
            </h2>
            <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <li
                v-for="c in d.cards"
                :key="c.venueId"
              >
                <UButton
                  :to="`/live/front-of-house/emergency/${encodeURIComponent(c.venueId)}`"
                  icon="i-lucide-siren"
                  color="error"
                  variant="outline"
                  size="xl"
                  block
                  :label="c.venueName"
                />
              </li>
            </ul>
          </section>
        </div>
      </template>
    </DataBoundary>
  </PageLive>
</template>
