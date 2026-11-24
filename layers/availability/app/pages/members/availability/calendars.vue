<!-- Connect a calendar (S14, AV-26): the person's own calendar addresses, read for busy times only.
     Each shows when it last read, what tentative events become, "Refresh now" and "Disconnect". -->
<script setup lang="ts">
import { TENTATIVE_AS, type TentativeAs } from '../../../../shared/levels'
import type { Connection } from '../../../composables/useCalendars'

const { t } = useT()
const dates = useDates()
const { confirm } = useConfirm()
const c = await useCalendars()
const { data, status, error, refresh } = c
const adding = ref(false)
const tentative = computed(() => TENTATIVE_AS.map(v => ({ value: v, label: t(`availability.calendars.tentative.${v}`) })))
const KEPT = ['times', 'not-titles', 'disconnect'] as const

async function saved() {
  adding.value = false
  await refresh()
}

async function remove(conn: Connection) {
  if (await confirm({ verb: t('availability.calendars.disconnect'), thing: conn.label, consequence: t('availability.calendars.disconnect-consequence') })) await c.disconnect(conn)
}
</script>

<template>
  <PageFrame
    :title="t('availability.calendars.title')"
    :description="t('availability.calendars.description')"
    width="reading"
    :trail="[{ label: t('availability.mine.title'), to: '/members/availability' }]"
  >
    <template #primary>
      <UButton
        v-if="data?.offers.ics && data.connections.length < data.max"
        icon="i-lucide-plus"
        :label="t('availability.calendars.connect')"
        @click="adding = true"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-8">
          <EmptyState
            v-if="!d.connections.length"
            icon="i-lucide-calendar-plus"
            :title="t('availability.calendars.none')"
            :description="t('availability.calendars.none-help')"
          />
          <RecordList
            v-else
            flush
          >
            <RecordListItem
              v-for="conn in d.connections"
              :key="conn.id"
              icon="i-lucide-calendar"
              :name="conn.label"
              :description="conn.lastSyncedAt ? t('availability.calendars.synced', { when: dates.dateTime(conn.lastSyncedAt) }) : t('availability.calendars.never-synced')"
            >
              <StatusBadge
                :tone="c.tone(conn.state)"
                :label="t(`availability.calendars.states.${conn.state}`)"
              />
              <template #trailing>
                <USelect
                  :model-value="conn.tentativeAs"
                  :items="tentative"
                  :aria-label="t('availability.calendars.tentative-label')"
                  class="w-44"
                  @update:model-value="v => c.setTentative(conn, v as TentativeAs)"
                />
                <UButton
                  icon="i-lucide-refresh-cw"
                  :label="t('availability.calendars.refresh')"
                  color="neutral"
                  variant="ghost"
                  loading-auto
                  @click="c.refreshNow(conn)"
                />
                <UButton
                  icon="i-lucide-unlink"
                  :label="t('availability.calendars.disconnect')"
                  color="neutral"
                  variant="ghost"
                  @click="remove(conn)"
                />
              </template>
            </RecordListItem>
          </RecordList>
          <PageSection :title="t('availability.calendars.kept-title')">
            <ul class="list-disc space-y-1 ps-5 text-sm">
              <li
                v-for="k in KEPT"
                :key="k"
              >
                {{ t(`availability.calendars.kept-${k}`) }}
              </li>
            </ul>
          </PageSection>
        </div>
      </template>
    </DataBoundary>
    <UModal
      v-model:open="adding"
      :title="t('availability.calendars.connect')"
      :description="t('availability.calendars.connect-help')"
    >
      <template #body>
        <AvailabilityCalendarForm @saved="saved" />
      </template>
    </UModal>
  </PageFrame>
</template>
