<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { can, viewFinanceReports } from '#shared/utils/abilities'
import type { FinanceSeason, RevenueBySource, SeasonSummary } from '#shared/utils/season-dashboard'
import type { Period } from '#shared/utils/period-locks'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Money dashboard', middleware: 'console', docs: '/docs/money' })

const request = useRequestFetch()

// A term and a season are read here through the finance gate, the one this screen already holds.
const periodForm = await usePeriodForm('finance-period-choices', () => Promise.all([
  request<{ periods: Period[] }>('/api/admin/finance/terms'),
  request<{ seasons: FinanceSeason[] }>('/api/admin/finance/seasons'),
]).then(([terms, seasons]) => ({
  terms: terms.periods.map(({ id, label, fromDay, toDay }) => ({ id, label, fromDay, toDay })),
  seasons: seasons.seasons,
})))
const query = periodForm.query

const { data, status, error } = await useAsyncData(
  'season-summary',
  () => request<{ summary: SeasonSummary }>('/api/admin/finance/season', { query: query.value }).then(response => response.summary),
  { watch: [query] },
)

const summaryFailure = computed(() => (error.value ? refusalText(error.value, 'The dashboard could not be read.') : null))

const mayDrillDown = computed(() => can(useViewer().value, viewFinanceReports))

// The drill-down page owns its own declaration (K-129): the range travels as its happenedAt
// filter, the day the dashboard already resolved, never the period's own kind and day pair.
function entriesUrl(source?: string): string {
  if (!data.value) return '/money/entries'
  const params = new URLSearchParams({
    happenedAt: data.value.fromDay === data.value.toDay ? data.value.fromDay : `between:${data.value.fromDay},${data.value.toDay}`,
  })
  if (source) params.set('source', source)
  return `/money/entries?${params.toString()}`
}

const UButton = resolveComponent('UButton')

const revenueColumns = computed<TableColumn<RevenueBySource>[]>(() => [
  { id: 'source', header: 'Source', cell: ({ row }) => row.original.source },
  { id: 'amount', header: 'Amount', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.totalPence) },
  ...(mayDrillDown.value
    ? [{
        id: 'act',
        header: ACTIONS_HEADER,
        meta: RIGHT_ALIGNED,
        cell: ({ row }: { row: { original: RevenueBySource } }) => h(UButton, {
          size: 'sm',
          variant: 'subtle',
          to: entriesUrl(row.original.source),
        }, () => 'Entries'),
      }]
    : []),
])

// The four figures below the revenue table are one thing each, not rows of a list, so they read
// as a description list (design language rule 6).
const figures = computed(() => (data.value
  ? [
      { label: 'Refunds', test: 'refunds-pence', pence: data.value.refundsPence },
      { label: 'Forgone comps', test: 'comps-pence', pence: data.value.compsPence },
      { label: 'Forgone discounts', test: 'discounts-pence', pence: data.value.discountsPence },
      { label: 'Open variance', test: 'open-variance-pence', pence: data.value.openVariancePence },
    ]
  : []))
</script>

<template>
  <div class="space-y-6">
    <AdminToolbar
      :filterable="false"
      :searchable="false"
    >
      <template #actions>
        <PeriodFields :form="periodForm" />
      </template>
    </AdminToolbar>

    <UAlert
      v-if="summaryFailure"
      data-test="summary-failure"
      color="error"
      variant="subtle"
      :description="summaryFailure"
    />

    <template v-else-if="status !== 'pending' && data">
      <p class="text-sm text-muted">
        {{ data.fromDay }} to {{ data.toDay }}
      </p>

      <section
        class="space-y-2"
        data-test="section-revenue"
      >
        <h2 class="font-semibold">
          Revenue by source
        </h2>
        <UTable
          :data="data.revenueBySource"
          :columns="revenueColumns"
          data-test="revenue-by-source-table"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              Nothing was taken in this period.
            </p>
          </template>
        </UTable>
      </section>

      <section
        class="space-y-2"
        data-test="section-figures"
      >
        <dl class="divide-y divide-default text-sm">
          <div
            v-for="figure in figures"
            :key="figure.test"
            class="flex items-baseline justify-between gap-2 py-2"
          >
            <dt class="text-muted">
              {{ figure.label }}
            </dt>
            <dd
              :data-test="figure.test"
              class="text-right font-mono whitespace-nowrap"
            >
              {{ saysMoney(figure.pence) }}
            </dd>
          </div>
        </dl>
      </section>
    </template>
  </div>
</template>
