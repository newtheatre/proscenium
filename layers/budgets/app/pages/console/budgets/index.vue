<!-- Budgets: every budget of a finance year, with what it plans to spend, what has been spent and
     what is left, and a bar for each. Closed ones sit below a divider. -->
<script setup lang="ts">
type BudgetState = 'draft' | 'proposed' | 'approved' | 'closed'
interface Totals { budgetedMinor: number, committedMinor: number, actualMinor: number, remainingMinor: number }
interface Row { id: string, name: string, scope: string, subject: string | null, state: BudgetState, currency: string, totals: Totals }

const { t } = useT()
const text = useBudgetText()
const year = ref<string | undefined>(undefined)
const query = computed(() => ({ year: year.value }))
const { data, status, error, refresh } = await useAPI<{ year: string, years: string[], budgets: Row[], canManage: boolean }>('/api/budgets/budgets', { key: 'budgets:list', query, watch: [query] })
watch(data, (d) => { if (d && !year.value) year.value = d.year }, { immediate: true })
const years = computed(() => (data.value?.years ?? []).map(y => ({ value: y, label: text.year(y) })))
const open = computed(() => (data.value?.budgets ?? []).filter(b => b.state !== 'closed'))
const closed = computed(() => (data.value?.budgets ?? []).filter(b => b.state === 'closed'))
// A production's Budget tab links here with ?new=production&productionId=… to start its budget.
const route = useRoute()
const forProduction = computed(() => route.query.new === 'production' && typeof route.query.productionId === 'string' ? route.query.productionId : undefined)
const creating = ref(!!forProduction.value)

function describe(b: Row) {
  const parts = [t(`budgets.screens.scopes.${b.scope}`), b.subject && b.subject !== b.name ? b.subject : null, text.state(b.state).label]
  return parts.filter(Boolean).join(' · ')
}
function spent(b: Row) {
  return t('budgets.screens.list.spent-of', { spent: text.money(b.totals.actualMinor + b.totals.committedMinor, b.currency), budgeted: text.money(b.totals.budgetedMinor, b.currency) })
}
const over = (b: Row) => b.totals.remainingMinor < 0
const share = (b: Row) => b.totals.budgetedMinor ? Math.min(100, Math.round(100 * (b.totals.actualMinor + b.totals.committedMinor) / b.totals.budgetedMinor)) : 0 // not-policy: a percentage
</script>

<template>
  <PageFrame :title="t('budgets.navigation.budgets.label')">
    <template #primary>
      <PageActions
        v-if="data?.canManage"
        :actions="[{ label: t('budgets.screens.new.title'), icon: 'i-lucide-plus', onSelect: () => { creating = true } }]"
      />
    </template>
    <template #toolbar>
      <USelect
        v-model="year"
        :items="years"
        :aria-label="t('budgets.screens.list.year')"
        class="min-w-40"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.budgets.length"
        icon="i-lucide-piggy-bank"
        :title="t('budgets.screens.list.empty')"
        :description="t('budgets.screens.list.empty-help')"
      />
      <div
        v-else
        class="space-y-4"
      >
        <RecordList
          v-if="open.length"
          :label="t('budgets.navigation.budgets.label')"
        >
          <RecordListItem
            v-for="b in open"
            :key="b.id"
            :to="`/console/budgets/${b.id}`"
            icon="i-lucide-piggy-bank"
            :name="b.name"
            :description="describe(b)"
          >
            <template #below>
              <div class="mt-2 flex items-center gap-3">
                <UProgress
                  :model-value="share(b)"
                  :color="over(b) ? 'warning' : 'primary'"
                  size="sm"
                  class="max-w-64"
                  :aria-label="spent(b)"
                />
                <span class="text-sm text-muted">{{ spent(b) }}<template v-if="over(b)"> · {{ t('budgets.screens.over') }}</template></span>
              </div>
            </template>
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          :label="t('budgets.screens.list.closed')"
          :count="closed.length"
        >
          <RecordList :label="t('budgets.screens.list.closed')">
            <RecordListItem
              v-for="b in closed"
              :key="b.id"
              :to="`/console/budgets/${b.id}`"
              icon="i-lucide-piggy-bank"
              :name="b.name"
              :description="`${describe(b)} · ${spent(b)}`"
              muted
            />
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
    <BudgetsNewDialog
      v-model:open="creating"
      :production-id="forProduction"
      @created="(id: string) => navigateTo(`/console/budgets/${id}`)"
    />
  </PageFrame>
</template>
