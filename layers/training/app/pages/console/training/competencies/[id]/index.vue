<!-- K8 A competency (training-records part 5; TR-35): how many routes and holders above its routes as
     cards, each saying what it needs. "Edit routes" opens the editor; history is the record's own. -->
<script setup lang="ts">
import type { CompetencyView } from '../../../../../composables/useCompetencyRecord'

definePageMeta({ layout: 'console' })

const { t } = useT()
const words = useRouteWords()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<CompetencyView>(() => `/api/training/competencies/${encodeURIComponent(id.value)}`, { key: `training:competency:${id.value}` })
const { refusal, editing, primary, onPrimary, actions, summary, recordStatus } = useCompetencyRecord(id, data, refresh)
const trail = computed(() => [{ label: t('training.navigation.competencies.label'), to: '/console/training/competencies' }])
const tabs = computed(() => [{ id: 'routes', label: t('training.competency-record.tab.routes') }])
const itemsOf = (r: CompetencyView['routes'][number]) => r.items.map(i => ({ label: i.kind === 'course' ? i.courseTitle : i.label ?? i.requirementRef }))
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageRecord
        :title="d.competency.title"
        :status="recordStatus"
        :primary="primary"
        :actions="actions"
        :summary="summary"
        record-type="training.competency"
        :record-id="d.competency.id"
        :tabs="tabs"
        :trail="trail"
        @primary="onPrimary"
      >
        <template #tab-routes>
          <div class="space-y-4">
            <RefusalNotice :refusal="refusal" />
            <p
              v-if="d.competency.description"
              class="text-muted"
            >
              {{ d.competency.description }}
            </p>
            <p class="text-sm text-muted">
              {{ t('training.competency-record.routes-help') }}
            </p>
            <RecordList
              v-if="d.routes.length"
              :label="t('training.competency-record.tab.routes')"
            >
              <RecordListItem
                v-for="(r, i) in d.routes"
                :key="r.id"
                icon="i-lucide-route"
                :name="`${i + 1}. ${r.label}`"
                :description="words(itemsOf(r))"
                :muted="r.status === 'retired'"
              >
                <StatusBadge
                  v-if="r.status === 'retired'"
                  tone="neutral"
                  :label="t('training.competency-record.route-retired')"
                />
              </RecordListItem>
            </RecordList>
            <EmptyState
              v-else
              icon="i-lucide-route"
              :title="t('training.competency-record.no-routes.title')"
              :description="t('training.competency-record.no-routes.description')"
            />
          </div>
        </template>
      </PageRecord>
      <TrainingCompetencyDialog
        v-model:open="editing"
        :competency="d.competency"
        @saved="refresh()"
      />
    </template>
  </DataBoundary>
</template>
