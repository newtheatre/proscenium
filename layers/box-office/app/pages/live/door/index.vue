<!-- The door on the Tonight hub (live mode): today's performances this person may admit people to,
     one large button each. -->
<script setup lang="ts">
interface Tonight { performances: { id: string, show: string, label: string | null, startsAt: number, venue: string | null }[] }
const { t } = useT()
const { time } = useDates()
const { data, status, error, refresh } = await useAPI<Tonight>('/api/box-office/door/tonight', { key: 'box-office:door:tonight' })
</script>

<template>
  <PageLive :title="t('box-office.live-door.title')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <section
          class="mx-auto max-w-3xl"
          aria-labelledby="door-tonight"
        >
          <h2
            id="door-tonight"
            class="mb-3 text-sm font-semibold text-muted"
          >
            {{ t('box-office.live-door.pick.heading') }}
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
                :to="`/live/door/${encodeURIComponent(p.id)}`"
                color="neutral"
                variant="outline"
                size="xl"
                block
                trailing-icon="i-lucide-chevron-right"
                class="min-h-20 justify-between text-start"
              >
                <span class="flex flex-col">
                  <span class="text-lg font-semibold">{{ p.show }}</span>
                  <span class="text-sm text-muted">{{ [time(p.startsAt), p.label, p.venue].filter(Boolean).join(' · ') }}</span>
                </span>
              </UButton>
            </li>
          </ul>
          <EmptyState
            v-else
            icon="i-lucide-moon"
            :title="t('box-office.live-door.pick.none.title')"
            :description="t('box-office.live-door.pick.none.description')"
          />
        </section>
      </template>
    </DataBoundary>
  </PageLive>
</template>
