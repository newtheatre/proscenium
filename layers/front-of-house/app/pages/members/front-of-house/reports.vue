<!-- My reports (FH-8): the incidents this person has reported, newest first, with each one's number,
     date, kind, where it has got to, their own words and the people they named (IN-1). Nothing the
     reviewers added is shown. -->
<script setup lang="ts">
interface Mine { id: string, reference: string, kind: 'incident' | 'near_miss', state: 'reported' | 'in_review' | 'closed', occurredAt: number, whatHappened: string, people: { name: string, involvement: 'affected' | 'witness' | 'helped' | 'other' }[] }

const { t } = useT()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<{ incidents: Mine[] }>('/api/front-of-house/incidents/mine', { key: 'front-of-house:my-reports' })
const TONES = { reported: 'warning', in_review: 'info', closed: 'neutral' } as const
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="t('front-of-house.navigation.my-reports.label')"
        :description="t('front-of-house.my-reports.description')"
      >
        <template #primary>
          <UButton
            to="/live/front-of-house/incident"
            icon="i-lucide-shield-alert"
            :label="t('front-of-house.live.report-incident')"
          />
        </template>
        <EmptyState
          v-if="!d.incidents.length"
          icon="i-lucide-shield-alert"
          :title="t('front-of-house.my-reports.none')"
          :description="t('front-of-house.my-reports.none-description')"
        />
        <RecordList
          v-else
          :label="t('front-of-house.navigation.my-reports.label')"
        >
          <RecordListItem
            v-for="i in d.incidents"
            :key="i.id"
            icon="i-lucide-shield-alert"
            :name="`${i.reference} · ${t(`front-of-house.incident-kinds.${i.kind}`)}`"
            :description="dateTime(i.occurredAt)"
          >
            <StatusBadge
              :tone="TONES[i.state]"
              :label="t(`front-of-house.incident-states.${i.state}`)"
            />
            <template #below>
              <p class="line-clamp-3 text-sm whitespace-pre-line">
                {{ i.whatHappened }}
              </p>
              <p
                v-if="i.people.length"
                class="mt-1 text-sm text-muted"
              >
                {{ t('front-of-house.my-reports.people', { people: i.people.map(p => `${p.name} (${t(`front-of-house.involvements.${p.involvement}`).toLowerCase()})`).join(', ') }) }}
              </p>
            </template>
          </RecordListItem>
        </RecordList>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
