<!-- Expenses in the members' area (BC-15): the person's own requests to spend, open ones first, each
     with where it has got to and any note from whoever decided it. "Ask to spend" makes a new one; a
     request nothing has been spent against can be withdrawn. Claims join this page with their slice. -->
<script setup lang="ts">
type RequestState = 'requested' | 'approved' | 'declined' | 'withdrawn' | 'fulfilled' | 'lapsed'
interface Mine { id: string, lineName: string, budgetName: string, currency: string, amountMinor: number, description: string, neededBy: string | null, state: RequestState, decisionNote: string | null, fulfilledMinor: number, lapsesOn: string | null, createdAt: number }
interface OfferedLine { id: string, name: string, budgetId: string, budgetName: string, currency: string }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const text = useBudgetText()
const { data, status, error, refresh } = await useAPI<{ requests: Mine[], lines: OfferedLine[] }>('/api/budgets/requests', { key: 'budgets:my-requests' })
const asking = ref(false)

function describe(r: Mine) {
  return [
    `${r.budgetName}: ${r.lineName}`,
    r.description,
    r.state === 'approved' && r.lapsesOn ? t('budgets.screens.requests.until', { day: day(r.lapsesOn) }) : null,
    r.decisionNote,
  ].filter(Boolean).join(' · ')
}
const withdrawable = (r: Mine) => (r.state === 'requested' || r.state === 'approved') && !r.fulfilledMinor
async function withdraw(r: Mine) {
  try {
    await $api(`/api/budgets/requests/${r.id}/withdraw` as string, { method: 'POST', body: {} })
    toast.add({ title: t('budgets.screens.requests.withdrawn'), color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
async function asked() {
  toast.add({ title: t('budgets.screens.requests.sent'), color: 'success' })
  await refresh()
}
</script>

<template>
  <PageFrame
    :title="t('budgets.navigation.expenses.label')"
    :description="t('budgets.screens.requests.page-help')"
  >
    <template #primary>
      <PageActions
        :actions="[{ label: t('budgets.screens.requests.ask'), icon: 'i-lucide-hand-coins', disabled: !data?.lines.length, onSelect: () => { asking = true } }]"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="data && !data.requests.length"
        icon="i-lucide-receipt"
        :title="t('budgets.screens.requests.none')"
        :description="t(data.lines.length ? 'budgets.screens.requests.none-help' : 'budgets.screens.requests.no-lines')"
      />
      <RecordList
        v-else-if="data"
        :label="t('budgets.navigation.expenses.label')"
      >
        <RecordListItem
          v-for="r in data.requests"
          :key="r.id"
          icon="i-lucide-hand-coins"
          :name="text.money(r.amountMinor, r.currency)"
          :description="describe(r)"
          :muted="!withdrawable(r) && r.state !== 'fulfilled'"
        >
          <template #below>
            <StatusBadge v-bind="text.requestState(r.state)" />
          </template>
          <RowActions
            v-if="withdrawable(r)"
            :items="[{ label: t('budgets.screens.requests.withdraw'), icon: 'i-lucide-x', onSelect: () => withdraw(r) }]"
            :label="t('budgets.screens.requests.actions')"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>
    <BudgetsRequestDialog
      v-model:open="asking"
      :lines="data?.lines ?? []"
      @saved="asked"
    />
  </PageFrame>
</template>
