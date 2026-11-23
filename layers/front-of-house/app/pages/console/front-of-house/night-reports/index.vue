<!-- Night reports (Front of house specification, part 5, "Console"): newest first, each with its
     performance, whether it is signed off and by whom, and the counts of checklist exceptions and
     incidents. Each row opens the report. -->
<script setup lang="ts">
interface Report {
  id: string
  performanceId: string
  state: 'draft' | 'signed_off'
  signedOffAt: number | null
  signedOffByName: string | null
  show: string | null
  startsAt: number | null
  exceptions: number | null
  incidents: number | null
}

const { t } = useT()
const { dateTime } = useDates()
const { data, status, error, refresh } = await useAPI<{ reports: Report[] }>('/api/front-of-house/night-reports', { key: 'front-of-house:night-reports' })

const describe = (r: Report) => [
  r.startsAt ? dateTime(r.startsAt) : null,
  r.state === 'signed_off' && r.signedOffByName ? t('front-of-house.night-reports.signed-by', { name: r.signedOffByName }) : null,
  r.exceptions !== null ? t('front-of-house.night-reports.exceptions', { count: r.exceptions }) : null,
  r.incidents !== null ? t('front-of-house.night-reports.incidents', { count: r.incidents }) : null,
].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame :title="t('front-of-house.navigation.night-reports.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.reports.length"
          :title="t('front-of-house.night-reports.empty.title')"
          :description="t('front-of-house.night-reports.empty.description')"
          icon="i-lucide-notebook-pen"
        />
        <RecordList
          v-else
          :label="t('front-of-house.navigation.night-reports.label')"
        >
          <RecordListItem
            v-for="r in d.reports"
            :key="r.id"
            :to="`/console/front-of-house/night-reports/${encodeURIComponent(r.performanceId)}`"
            icon="i-lucide-notebook-pen"
            :name="r.show ?? t('front-of-house.night-reports.performance')"
            :description="describe(r)"
          >
            <StatusBadge
              :tone="r.state === 'signed_off' ? 'success' : 'warning'"
              :label="t(r.state === 'draft' ? 'core.states.draft' : 'front-of-house.report-states.signed_off')"
            />
          </RecordListItem>
        </RecordList>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
