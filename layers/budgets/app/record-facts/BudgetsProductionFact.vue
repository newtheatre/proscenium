<!-- The Budget fact in a production's summary strip (BC-11): spent of budgeted, or no budget yet. -->
<script setup lang="ts">
const props = defineProps<{ recordId: string }>()
const { t } = useT()
const text = useBudgetText()
const { data } = await useProductionBudget(() => props.recordId)
</script>

<template>
  <div v-if="data">
    <dt class="text-xs text-muted">
      {{ t('budgets.screens.production.fact') }}
    </dt>
    <dd class="font-medium tabular-nums text-highlighted">
      {{ data.budget && data.totals ? t('budgets.screens.production.fact-value', { spent: text.money(data.totals.actualMinor, data.budget.currency), budgeted: text.money(data.totals.budgetedMinor, data.budget.currency) }) : t('budgets.screens.production.none') }}
    </dd>
  </div>
</template>
