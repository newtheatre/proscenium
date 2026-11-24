<!-- Reports (REP-04, REP-13): saved reports first (the person's own and those shared with them, archived
     below a divider), then the ready-made ones grouped by area. Each figure is still checked when it
     is read, so a report can open with some figures left out. -->
<script setup lang="ts">
import type { Area, ScopeKind } from '../../../../shared/reports'

definePageMeta({ layout: 'console' })

interface Listed { id: string, label: string, description: string, area: Area, scope: ScopeKind, module: string }
interface Saved { id: string, kind: 'figures' | 'people', name: string, description: string | null, basedOn: string | null, mine: boolean, shared: boolean, archived: boolean, editable: boolean }

const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ reports: Listed[], saved: Saved[], mayCreate: boolean }>('/api/reports/definitions', { key: 'reports:definitions' })
const { archive } = useReportArchive()
const { $api } = useNuxtApp()
const { offer } = useUndo()

const search = ref('')
const searching = ref(false)
const showArchived = ref(false)
const matches = (...texts: (string | null)[]) => {
  const words = search.value.trim().toLowerCase()
  return !words || texts.some(x => x?.toLowerCase().includes(words))
}
const saved = computed(() => (data.value?.saved ?? []).filter(s => matches(s.name, s.description)))
const current = computed(() => saved.value.filter(s => !s.archived))
const archived = computed(() => saved.value.filter(s => s.archived))
const groups = computed(() => {
  const out = new Map<Area, Listed[]>()
  for (const report of data.value?.reports ?? []) {
    if (!matches(t(report.label), t(report.description))) continue
    out.set(report.area, [...out.get(report.area) ?? [], report])
  }
  return [...out.entries()].map(([area, reports]) => ({ area, reports }))
})
const anything = computed(() => !!(data.value?.reports.length || data.value?.saved.length))
const describe = (s: Saved) => [s.description, s.mine ? null : t('reports.saved.shared-with-you'), s.mine && s.shared ? t('reports.saved.shared') : null].filter(Boolean).join(' · ')

async function restore(s: Saved) {
  await $api(`/api/reports/definitions/${s.id}/archive`, { method: 'POST', body: { archived: false } })
  await refresh()
  offer(t('reports.restored-toast', { name: s.name }), async () => {
    await $api(`/api/reports/definitions/${s.id}/archive`, { method: 'POST', body: { archived: true } })
    await refresh()
  })
}
const rowActions = (s: Saved) => [
  { label: t('reports.edit'), icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/console/reports/${s.id}/edit`) },
  s.archived
    ? { label: t('reports.restore'), icon: 'i-lucide-archive-restore', onSelect: () => restore(s) }
    : { label: t('reports.archive'), icon: 'i-lucide-archive', onSelect: () => archive(s.id, s.name) },
]
</script>

<template>
  <PageFrame
    :title="t('reports.title')"
    :description="t('reports.description')"
  >
    <template #primary>
      <SearchToggle
        v-if="anything"
        v-model="search"
        v-model:open="searching"
        :label="t('reports.search')"
      />
      <PageActions
        v-if="data?.mayCreate"
        :actions="[{ label: t('reports.new'), icon: 'i-lucide-plus', to: '/console/reports/new' }]"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!anything"
        :title="t('reports.empty')"
        :description="t('reports.empty-description')"
        icon="i-lucide-chart-column"
      />
      <p
        v-else-if="!groups.length && !saved.length"
        class="text-sm text-muted"
      >
        {{ t('reports.no-match', { search: search.trim() }) }}
      </p>
      <div
        v-else
        class="space-y-8"
      >
        <PageSection
          v-if="saved.length"
          :title="t('reports.saved.title')"
        >
          <div class="space-y-4">
            <RecordList
              v-if="current.length"
              :label="t('reports.saved.title')"
            >
              <RecordListItem
                v-for="s in current"
                :key="s.id"
                :to="`/console/reports/${s.id}`"
                :icon="s.kind === 'people' ? 'i-lucide-users' : 'i-lucide-table-properties'"
                :name="s.name"
                :description="describe(s) || undefined"
              >
                <RowActions
                  v-if="s.editable"
                  :label="t('reports.saved.actions', { name: s.name })"
                  :items="rowActions(s)"
                />
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              v-model:open="showArchived"
              :label="t('reports.saved.archived')"
              :count="archived.length"
            >
              <RecordList :label="t('reports.saved.archived')">
                <RecordListItem
                  v-for="s in archived"
                  :key="s.id"
                  :to="`/console/reports/${s.id}`"
                  :icon="s.kind === 'people' ? 'i-lucide-users' : 'i-lucide-table-properties'"
                  :name="s.name"
                  :description="describe(s) || undefined"
                  muted
                >
                  <RowActions
                    v-if="s.editable"
                    :label="t('reports.saved.actions', { name: s.name })"
                    :items="rowActions(s)"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </PageSection>
        <PageSection
          v-for="group in groups"
          :key="group.area"
          :title="t(`reports.areas.${group.area}`)"
        >
          <RecordList :label="t(`reports.areas.${group.area}`)">
            <RecordListItem
              v-for="report in group.reports"
              :key="report.id"
              :to="`/console/reports/${report.id}`"
              icon="i-lucide-chart-column"
              :name="t(report.label)"
              :description="t(report.description)"
            />
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
