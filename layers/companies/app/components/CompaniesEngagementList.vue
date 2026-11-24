<!-- A company's Engagements tab: each production or hire it has dealt with, newest first, with its
     state and last date. -->
<script setup lang="ts">
import type { CompanyDetail } from '../../shared/views'

defineProps<{ company: CompanyDetail }>()
const { t } = useT()
const dates = useDates()
const { stateBadge } = useCompanyWords()
</script>

<template>
  <PageSection :title="t('companies.tabs.engagements')">
    <EmptyState
      v-if="!company.engagements.length"
      :title="t('companies.engagements.empty')"
      :description="t('companies.engagements.empty-description')"
      icon="i-lucide-handshake"
    />
    <RecordList
      v-else
      :label="t('companies.tabs.engagements')"
    >
      <RecordListItem
        v-for="e in company.engagements"
        :key="e.id"
        :name="e.title"
        :description="[t(`companies.kinds.${e.kind}`), e.lastDate ? t('companies.last-date', { date: dates.day(e.lastDate) }) : null].filter(Boolean).join(' · ')"
      >
        <StatusBadge v-bind="stateBadge(e.state)" />
      </RecordListItem>
    </RecordList>
  </PageSection>
</template>
