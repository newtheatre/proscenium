<!-- K8's routes editor (TR-35): a competency's routes in order, each opened in a dialogue to change.
     Drag a route by its handle or use its menu to move it. A route taken out is retired, not deleted.
     Nothing is saved until "Save routes", which says how many hold it before and after. -->
<script setup lang="ts">
import type { CompetencyView } from '../../../../../composables/useCompetencyRecord'
import type { RouteOptions } from '../../../../../../server/console-competencies'
import { newRoute, useRouteEditor, useRouteWords, type RouteDraft } from '../../../../../composables/useRouteEditor'

definePageMeta({ layout: 'console' })

const { t } = useT()
const words = useRouteWords()
const route = useRoute()
const id = computed(() => String(route.params.id))
const recordPath = computed(() => `/console/training/competencies/${encodeURIComponent(id.value)}`)
const { data, status, error, refresh } = await useAPI<CompetencyView>(() => `/api/training/competencies/${encodeURIComponent(id.value)}`, { key: `training:competency:${id.value}` })
const { data: options } = await useAPI<RouteOptions>('/api/training/competencies/route-options', { key: 'training:route-options', default: () => ({ courses: [], recognised: [] }) })
const routes = computed(() => data.value?.routes ?? [])
const { drafts, refusal, saving, editing, put, move, remove, save } = useRouteEditor(id, routes)
const trail = computed(() => [
  { label: t('training.navigation.competencies.label'), to: '/console/training/competencies' },
  { label: data.value?.competency.title ?? '', to: recordPath.value },
])

function done(r: RouteDraft) {
  put(r)
  editing.value = null
}
// The record shares this page's data, so it is read again before going back to it.
async function saveAll() {
  if (!await save()) return
  await refresh()
  await navigateTo(recordPath.value)
}
const rowActions = (r: RouteDraft, i: number) => [
  [
    { label: t('training.route-editor.edit'), icon: 'i-lucide-pencil', onSelect: () => { editing.value = r } },
    { label: t('training.step-editor.up'), icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => move(i, i - 1) },
    { label: t('training.step-editor.down'), icon: 'i-lucide-arrow-down', disabled: i === drafts.value.length - 1, onSelect: () => move(i, i + 1) },
  ],
  [{ label: t('training.route-editor.retire'), icon: 'i-lucide-archive', color: 'error' as const, onSelect: () => remove(r.key) }],
]
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default>
      <PageFrame
        :title="t('training.route-editor.page')"
        :trail="trail"
      >
        <template #primary>
          <UButton
            icon="i-lucide-save"
            :loading="saving"
            :label="t('training.route-editor.save')"
            @click="saveAll"
          />
        </template>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <p class="text-sm text-muted">
            {{ t('training.route-editor.help') }}
          </p>
          <SortableList
            v-if="drafts.length"
            :label="t('training.competency-record.tab.routes')"
            @reorder="m => move(m.from, m.to)"
          >
            <SortableRow
              v-for="(r, i) in drafts"
              :id="r.key"
              :key="r.key"
              :index="i"
              :name="r.label"
              :description="words(r.items)"
            >
              <template #leading>
                <IconButton
                  :data-drag-handle="r.key"
                  icon="i-lucide-grip-vertical"
                  size="sm"
                  class="cursor-grab touch-none"
                  :label="t('training.route-editor.handle', { label: r.label })"
                />
              </template>
              <RowActions
                :label="t('training.route-editor.actions', { label: r.label })"
                :items="rowActions(r, i)"
              />
            </SortableRow>
          </SortableList>
          <EmptyState
            v-else
            icon="i-lucide-route"
            :title="t('training.route-editor.empty.title')"
            :description="t('training.route-editor.empty.description')"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :label="t('training.route-editor.add')"
            @click="editing = newRoute()"
          />
        </div>
        <TrainingRouteDialog
          :route="editing"
          :options="options!"
          @done="done"
          @close="editing = null"
        />
      </PageFrame>
    </template>
  </DataBoundary>
</template>
