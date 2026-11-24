<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { EngagementDetail } from '../../../../../shared/views'

// One engagement for staff (part 5): its outline and its history. Confirming is the primary step once
// it is agreed; cancelling, with a reason, is last in the menu (E5). Linking a production names it (G3).
const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))
const dates = useDates()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { offer } = useUndo()
const { stateBadge } = useCompanyWords()
const { data, status, error, refresh } = await useAPI<EngagementDetail>(() => `/api/companies/engagements/${id.value}/staff`, { key: `companies:engagement:${id.value}` })
const engagement = computed(() => data.value ?? null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const cancelling = ref(false)
const linking = ref(false)

const primary = computed(() => engagement.value?.canManage && engagement.value.state === 'agreed' ? { label: t('companies.engagements.confirm'), icon: 'i-lucide-circle-check' } : undefined)
async function confirm() {
  refusal.value = null
  try {
    await $api(`/api/companies/engagements/${id.value}/confirm` as string, { method: 'POST', body: {} })
    await refresh()
    offer(t('companies.engagements.confirmed'))
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const actions = computed<DropdownMenuItem[][]>(() => {
  const e = engagement.value
  if (!e?.canManage || ['cancelled', 'settled'].includes(e.state)) return []
  return [
    ...(e.productionId ? [] : [[{ label: t('companies.engagements.link-title'), icon: 'i-lucide-link', onSelect: () => { linking.value = true } }]]),
    ...(e.state === 'settled' ? [] : [[{ label: t('companies.engagements.cancel-button'), icon: 'i-lucide-circle-x', color: 'error' as const, onSelect: () => { cancelling.value = true } }]]),
  ]
})
const when = (e: EngagementDetail) => e.firstDate ? (e.lastDate && e.lastDate !== e.firstDate ? dates.range(e.firstDate, e.lastDate) : dates.day(e.firstDate)) : t('companies.mine.no-dates')
const summary = computed(() => {
  const e = engagement.value
  if (!e) return []
  return [
    { label: t('companies.field.company'), value: e.company, to: `/console/companies/${e.companyId}` },
    { label: t('companies.field.kind'), value: t(`companies.kinds.${e.kind}`) },
    { label: t('companies.field.production'), value: e.production ?? t('companies.engagements.no-production'), ...e.productionId ? { to: `/console/programme/productions/${e.productionId}` } : {} },
    { label: t('companies.field.dates'), value: when(e) },
  ]
})
const tabs = computed(() => [{ id: 'overview', label: t('companies.tabs.overview') }, { id: 'agreement', label: t('companies.tabs.agreement') }, { id: 'history', label: t('companies.tabs.history') }])
const historyItems = computed(() => (engagement.value?.history ?? []).map(h => ({
  value: h.id,
  date: dates.dateTime(h.at),
  title: t(`companies.history.${h.kind}`, { to: h.toState ? t(h.kind === 'agreement-answered' ? `companies.agreements.states.${h.toState}` : `companies.states.${h.toState}`) : '' }),
  description: h.actor ?? undefined,
})))
function linked(title: string) {
  void refresh()
  offer(t('companies.engagements.linked', { title }))
}
function cancelled() {
  void refresh()
  offer(t('companies.engagements.cancelled'))
}
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <PageRecord
      v-if="engagement"
      :title="engagement.title"
      :status="stateBadge(engagement.state)"
      :primary="primary"
      :actions="actions"
      :summary="summary"
      record-type="companies.engagement"
      :record-id="engagement.id"
      :tabs="tabs"
      :trail="[{ label: t('companies.navigation.engagements.label'), to: '/console/companies/engagements' }]"
      :checklist="false"
      @primary="confirm"
    >
      <template #tab-overview>
        <div class="space-y-4">
          <RefusalNotice :refusal="refusal" />
          <UAlert
            v-if="engagement.state === 'cancelled' && engagement.cancelReason"
            color="neutral"
            variant="subtle"
            icon="i-lucide-circle-x"
            :title="t('companies.engagements.cancelled-because')"
            :description="engagement.cancelReason"
          />
          <PageSection
            :title="t('companies.engagements.next-steps')"
            :description="t(`companies.engagements.next.${engagement.state}`)"
          />
        </div>
      </template>
      <template #tab-agreement>
        <CompaniesAgreementTab
          :engagement-id="engagement.id"
          :currency="engagement.currency"
          :closed="['cancelled', 'settled'].includes(engagement.state)"
          @changed="refresh()"
        />
      </template>
      <template #tab-history>
        <UTimeline
          :items="historyItems"
          :default-value="historyItems.length ? historyItems[0]!.value : undefined"
        />
      </template>
    </PageRecord>
    <CompaniesCancelEngagementDialog
      v-if="engagement"
      v-model:open="cancelling"
      :engagement-id="engagement.id"
      :title="engagement.title"
      @cancelled="cancelled"
    />
    <CompaniesLinkProductionDialog
      v-if="engagement"
      v-model:open="linking"
      :engagement-id="engagement.id"
      @linked="linked"
    />
  </DataBoundary>
</template>
