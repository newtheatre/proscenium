<!-- Payments to make (BC-29 to BC-32): approved claims still owed, grouped by claimant and route,
     never the payer's own. Bank details show as on file or missing, never the details. Choosing claims
     of one group and recording the payment marks them paid; the parent body's schedule downloads. -->
<script setup lang="ts">
import type { PayGroup } from '../../../composables/usePaymentsToMake'

const { t } = useT()
const { day } = useDates()
const text = useBudgetText()
const { data, status, error, refresh, groups, payeeOf, selected, toggle, chosen, chosenMinor, selectedGroup } = await usePaymentsToMake()
const recording = ref(false)
const toast = useToast()

function describeGroup(g: PayGroup) {
  const payee = payeeOf(g)
  const bank = payee === undefined ? null : payee?.held ? t('budgets.screens.to-pay.bank-on-file', { digits: payee.lastDigits ?? '' }) : t('budgets.screens.to-pay.bank-missing')
  return [t(`budgets.settings.claims.routes.options.${g.route}`), text.money(g.owedMinor, g.currency), bank].filter(Boolean).join(' · ')
}
async function recorded() {
  selected.value = new Set()
  toast.add({ title: t('budgets.screens.to-pay.recorded'), color: 'success' })
  await refresh()
}
const actions = computed(() => [
  ...(chosen.value.length ? [{ label: t('budgets.screens.to-pay.record-some', { amount: text.money(chosenMinor.value, selectedGroup.value!.currency) }), icon: 'i-lucide-banknote-arrow-up', onSelect: () => { recording.value = true } }] : []),
])
const menu = computed(() => data.value?.routes.includes('parent-body') ? [{ label: t('budgets.screens.to-pay.schedule'), icon: 'i-lucide-download', to: '/api/budgets/to-pay/schedule.csv', external: true }] : [])
</script>

<template>
  <PageFrame
    :title="t('budgets.navigation.to-pay.label')"
    :description="t('budgets.screens.to-pay.help')"
    :trail="[{ label: t('budgets.navigation.budgets.label'), to: '/console/budgets' }]"
  >
    <template #primary>
      <PageActions
        :actions="actions"
        :menu="menu"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="data && !groups.length"
        icon="i-lucide-banknote"
        :title="t('budgets.screens.to-pay.none')"
      />
      <div
        v-else-if="data"
        class="space-y-6"
      >
        <PageSection
          v-for="g in groups"
          :key="g.key"
          :title="g.claimant || t('budgets.screens.claims.no-claimant')"
          :description="describeGroup(g)"
        >
          <RecordList :label="g.claimant || t('budgets.screens.claims.no-claimant')">
            <RecordListItem
              v-for="c in g.claims"
              :key="c.id"
              :name="`${c.number ?? ''} ${c.title}: ${text.money(c.owedMinor, c.currency)}`"
              :description="[c.decidedAt ? t('budgets.screens.to-pay.approved-on', { day: day(c.decidedAt) }) : null, c.paidMinor ? t('budgets.screens.to-pay.part-paid', { amount: text.money(c.paidMinor, c.currency) }) : null].filter(Boolean).join(' · ')"
              :to="`/console/budgets/claims/${c.id}`"
            >
              <template #leading>
                <UCheckbox
                  :model-value="selected.has(c.id)"
                  :aria-label="t('budgets.screens.to-pay.choose', { claim: c.number ?? c.title })"
                  @update:model-value="toggle(g, c.id, !!$event)"
                />
              </template>
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>
    <BudgetsRecordPaymentDialog
      v-model:open="recording"
      :group="selectedGroup"
      :claims="chosen"
      @recorded="recorded"
    />
  </PageFrame>
</template>
