<!-- A company's Engagements tab: each production or hire it has dealt with, newest first, with its
     state and last date, and New engagement for someone who may open one. -->
<script setup lang="ts">
import type { CompanyDetail } from '../../shared/views'

defineProps<{ company: CompanyDetail }>()
const { t } = useT()
const dates = useDates()
const { stateBadge } = useCompanyWords()
const adding = ref(false)
</script>

<template>
  <PageSection :title="t('companies.tabs.engagements')">
    <template
      v-if="company.canOpenEngagement && !company.archived"
      #actions
    >
      <UButton
        :label="t('companies.engagements.new')"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        @click="adding = true"
      />
    </template>
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
        :to="`/console/companies/engagements/${e.id}`"
        :name="e.title"
        :description="[t(`companies.kinds.${e.kind}`), e.lastDate ? t('companies.last-date', { date: dates.day(e.lastDate) }) : null].filter(Boolean).join(' · ')"
      >
        <StatusBadge v-bind="stateBadge(e.state)" />
      </RecordListItem>
    </RecordList>
    <CompaniesNewEngagementDialog
      v-model:open="adding"
      :company-id="company.id"
    />
  </PageSection>
</template>
