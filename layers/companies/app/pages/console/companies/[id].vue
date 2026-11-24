<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { CompanyDetail } from '../../../../shared/views'

// One company (part 5): its contacts first, its engagements, then its details. Archived, it is kept
// as it was and restored in one step (CO-09).
const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))
const dates = useDates()
const { data, status, error, refresh } = await useAPI<CompanyDetail>(() => `/api/companies/${id.value}`, { key: `companies:company:${id.value}` })
const { refusal, archive, restore } = useCompanyArchive(refresh)
const company = computed(() => data.value ?? null)

const primary = computed(() => company.value?.archived && company.value.canManage ? { label: t('companies.restore'), icon: 'i-lucide-archive-restore' } : undefined)
const live = computed(() => company.value?.engagements.filter(e => !['cancelled', 'settled'].includes(e.state)).length ?? 0)
const actions = computed<DropdownMenuItem[][]>(() => {
  const c = company.value
  if (!c?.canManage || c.archived) return []
  return [[{ label: t('companies.archive'), icon: 'i-lucide-archive', disabled: live.value > 0, onSelect: () => { void archive(c) } }]]
})
const summary = computed(() => {
  const c = company.value
  if (!c) return []
  const contact = c.contacts.find(x => x.isPrimary)
  return [
    { label: t('companies.summary.primary'), value: contact?.name ?? t('companies.summary.none') },
    { label: t('companies.summary.live'), value: String(live.value) },
    { label: t('companies.summary.engagements'), value: String(c.engagements.length) },
    { label: t('companies.summary.since'), value: dates.day(c.createdAt) },
  ]
})
const tabs = computed(() => [
  { id: 'contacts', label: t('companies.tabs.contacts') },
  { id: 'engagements', label: t('companies.tabs.engagements') },
  { id: 'details', label: t('companies.tabs.details') },
])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <PageRecord
      v-if="company"
      :title="company.name"
      :status="company.archived ? { label: t('core.states.archived'), tone: 'info' } : undefined"
      :primary="primary"
      :actions="actions"
      :summary="summary"
      record-type="companies.company"
      :record-id="company.id"
      :tabs="tabs"
      :trail="[{ label: t('companies.navigation.companies.label'), to: '/console/companies' }]"
      :checklist="false"
      @primary="restore(company)"
    >
      <template #tab-contacts>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <CompaniesContactList
            :company="company"
            @changed="refresh()"
          />
        </div>
      </template>
      <template #tab-engagements>
        <CompaniesEngagementList :company="company" />
      </template>
      <template #tab-details>
        <CompaniesDetailsForm
          :company="company"
          @saved="refresh()"
        />
      </template>
    </PageRecord>
  </DataBoundary>
</template>
