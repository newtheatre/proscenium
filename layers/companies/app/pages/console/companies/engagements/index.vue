<script setup lang="ts">
// Engagements (part 5): every company's dealings, those still going first and newest first; settled
// and cancelled ones fold below. A new engagement starts from its company's page.
import type { EngagementListRow } from '../../../../../shared/views'

const { t } = useT()
const dates = useDates()
const { stateBadge } = useCompanyWords()
const { data, status, error, refresh } = await useAPI<{ engagements: EngagementListRow[], canManage: boolean }>('/api/companies/engagements', { key: 'companies:engagements' })

const search = ref('')
const searching = ref(false)
const matching = computed(() => {
  const words = search.value.trim().toLowerCase()
  return (data.value?.engagements ?? []).filter(e => !words || `${e.title} ${e.company}`.toLowerCase().includes(words))
})
const FINISHED = ['settled', 'cancelled']
const live = computed(() => matching.value.filter(e => !FINISHED.includes(e.state)))
const finished = computed(() => matching.value.filter(e => FINISHED.includes(e.state)))
const showFinished = ref(false)
watch(search, (words) => { if (words.trim() && finished.value.length) showFinished.value = true })
const describe = (e: EngagementListRow) => [
  e.company,
  t(`companies.kinds.${e.kind}`),
  e.firstDate ? (e.lastDate && e.lastDate !== e.firstDate ? dates.range(e.firstDate, e.lastDate) : dates.day(e.firstDate)) : null,
].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    :title="t('companies.navigation.engagements.label')"
    :description="t('companies.engagements.description')"
    width="reading"
  >
    <template #primary>
      <SearchToggle
        v-if="data?.engagements.length"
        v-model="search"
        v-model:open="searching"
        :label="t('companies.engagements.search')"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <EmptyState
          v-if="!data?.engagements.length"
          :title="t('companies.engagements.empty')"
          :description="t('companies.engagements.empty-list')"
          icon="i-lucide-handshake"
          :action="{ label: t('companies.navigation.companies.label'), to: '/console/companies' }"
        />
        <template v-else>
          <p
            v-if="!matching.length"
            class="text-sm text-muted"
          >
            {{ t('companies.no-match', { search: search.trim() }) }}
          </p>
          <RecordList
            v-if="live.length"
            :label="t('companies.navigation.engagements.label')"
          >
            <RecordListItem
              v-for="e in live"
              :key="e.id"
              :to="`/console/companies/engagements/${e.id}`"
              :name="e.title"
              :description="describe(e)"
            >
              <StatusBadge v-bind="stateBadge(e.state)" />
            </RecordListItem>
          </RecordList>
          <CollapsibleDivider
            v-model:open="showFinished"
            :label="t('companies.engagements.finished')"
            :count="finished.length"
          >
            <RecordList :label="t('companies.engagements.finished')">
              <RecordListItem
                v-for="e in finished"
                :key="e.id"
                :to="`/console/companies/engagements/${e.id}`"
                :name="e.title"
                :description="describe(e)"
                muted
              >
                <StatusBadge v-bind="stateBadge(e.state)" />
              </RecordListItem>
            </RecordList>
          </CollapsibleDivider>
        </template>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
