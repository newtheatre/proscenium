<!-- Expenses in the members' area (BC-15, BC-19): the person's own claims and requests to spend, open
     ones first, each with where it has got to. "Make a claim" starts a draft and opens it; "Ask to
     spend" makes a request; a request nothing has been spent against can be withdrawn. -->
<script setup lang="ts">
import type { ClaimState } from '../../../composables/useBudgetText'

type RequestState = 'requested' | 'approved' | 'declined' | 'withdrawn' | 'fulfilled' | 'lapsed'
interface Mine { id: string, lineName: string, budgetName: string, currency: string, amountMinor: number, description: string, neededBy: string | null, state: RequestState, decisionNote: string | null, fulfilledMinor: number, lapsesOn: string | null, createdAt: number }
interface OfferedLine { id: string, name: string, budgetId: string, budgetName: string, currency: string }
interface MyClaim { id: string, number: string | null, title: string, state: ClaimState, currency: string, totalMinor: number, approvedMinor: number | null, createdAt: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const text = useBudgetText()
const { data, status, error, refresh } = await useAPI<{ canClaim: boolean, canRequest: boolean, claims: MyClaim[], requests: Mine[], lines: OfferedLine[] }>('/api/budgets/expenses', { key: 'budgets:expenses' })
const asking = ref(false)
const claiming = ref(false)
const approvedRequests = computed(() => (data.value?.requests ?? []).filter(r => r.state === 'approved'))
const empty = computed(() => !!data.value && !data.value.claims.length && !data.value.requests.length)
const claimName = (c: MyClaim) => c.number ? t('budgets.screens.claims.numbered', { number: c.number, title: c.title }) : c.title
const actions = computed(() => [
  ...(data.value?.canClaim ? [{ label: t('budgets.screens.claims.make'), icon: 'i-lucide-receipt', disabled: !data.value.lines.length, onSelect: () => { claiming.value = true } }] : []),
  ...(data.value?.canRequest ? [{ label: t('budgets.screens.requests.ask'), icon: 'i-lucide-hand-coins', disabled: !data.value.lines.length, onSelect: () => { asking.value = true } }] : []),
])

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
      <PageActions :actions="actions" />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="data && empty"
        icon="i-lucide-receipt"
        :title="t('budgets.screens.requests.none')"
        :description="t(data.lines.length ? 'budgets.screens.requests.none-help' : 'budgets.screens.requests.no-lines')"
      />
      <div
        v-else-if="data"
        class="space-y-6"
      >
        <PageSection
          v-if="data.claims.length"
          :title="t('budgets.screens.claims.yours')"
        >
          <RecordList :label="t('budgets.screens.claims.yours')">
            <RecordListItem
              v-for="c in data.claims"
              :key="c.id"
              icon="i-lucide-receipt"
              :name="claimName(c)"
              :description="text.money(c.approvedMinor ?? c.totalMinor, c.currency)"
              :to="`/members/expenses/claims/${c.id}`"
            >
              <template #below>
                <StatusBadge v-bind="text.claimState(c.state)" />
              </template>
            </RecordListItem>
          </RecordList>
        </PageSection>
        <PageSection
          v-if="data.requests.length"
          :title="t('budgets.screens.requests.yours')"
        >
          <RecordList :label="t('budgets.screens.requests.yours')">
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
        </PageSection>
      </div>
    </DataBoundary>
    <BudgetsClaimNewDialog
      v-model:open="claiming"
      :requests="approvedRequests"
    />
    <BudgetsRequestDialog
      v-model:open="asking"
      :lines="data?.lines ?? []"
      @saved="asked"
    />
  </PageFrame>
</template>
