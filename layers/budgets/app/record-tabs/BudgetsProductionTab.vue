<!-- The Budget tab on a production's page (BC-11): its budget's figures and lines, with ticket and bar
     income to date on the income lines, and a link to the budget itself. Without one, a manager is
     offered to make it. Past budgets.close.after from the last performance it says it can be closed. -->
<script setup lang="ts">
const props = defineProps<{ recordId: string }>()
const { t } = useT()
const text = useBudgetText()
const { data, status, error, refresh } = await useProductionBudget(() => props.recordId)
const money = (minor: number) => text.money(minor, data.value?.budget?.currency ?? 'GBP')

const facts = computed(() => {
  const totals = data.value?.totals
  if (!totals) return []
  return [
    { label: t('budgets.screens.figures.budgeted'), value: money(totals.budgetedMinor), strong: true },
    { label: t('budgets.screens.figures.committed'), value: money(totals.committedMinor) },
    { label: t('budgets.screens.figures.spent'), value: money(totals.actualMinor) },
    { label: t('budgets.screens.figures.remaining'), value: totals.remainingMinor < 0 ? t('budgets.screens.over-by', { amount: money(-totals.remainingMinor) }) : money(totals.remainingMinor) },
    ...(data.value?.lines?.some(l => l.kind === 'income') ? [{ label: t('budgets.screens.figures.income'), value: t('budgets.screens.figures.income-of', { received: money(totals.incomeActualMinor), planned: money(totals.incomeBudgetedMinor) }) }] : []),
  ]
})
const describe = (l: NonNullable<NonNullable<typeof data.value>['lines']>[number]) => l.kind === 'income'
  ? t('budgets.screens.figures.income-of', { received: money(l.figures.actualMinor), planned: money(l.figures.budgetedMinor) })
  : t('budgets.screens.line.figures', { budgeted: money(l.figures.budgetedMinor), committed: money(l.figures.committedMinor), spent: money(l.figures.actualMinor) })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <EmptyState
      v-if="data && !data.budget"
      icon="i-lucide-piggy-bank"
      :title="t('budgets.screens.production.none')"
      :description="t('budgets.screens.production.none-help')"
    >
      <UButton
        v-if="data.canManage"
        icon="i-lucide-plus"
        :label="t('budgets.screens.production.make')"
        :to="{ path: '/console/budgets', query: { new: 'production', productionId: recordId } }"
      />
    </EmptyState>
    <div
      v-else-if="data?.budget"
      class="space-y-4"
    >
      <UAlert
        v-if="data.closeDue"
        color="info"
        variant="subtle"
        icon="i-lucide-lock"
        :title="t('budgets.screens.close.due')"
        :description="t('budgets.screens.close.due-help')"
      />
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ data.budget.name }}</span>
          <StatusBadge v-bind="text.state(data.budget.state)" />
        </div>
        <UButton
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-arrow-right"
          :label="t('budgets.screens.production.open')"
          :to="`/console/budgets/${data.budget.id}`"
        />
      </div>
      <FactStrip :facts="facts" />
      <RecordList :label="t('budgets.screens.production.lines')">
        <RecordListItem
          v-for="l in data.lines"
          :key="l.id"
          :name="l.name"
          :description="describe(l)"
        />
      </RecordList>
    </div>
  </DataBoundary>
</template>
