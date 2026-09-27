<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { saysEntrySource } from '#shared/utils/ledger'
import { saysDay } from '#shared/utils/when'
import { can, viewFinanceReports } from '#shared/utils/abilities'
import { entriesHref } from '#shared/utils/ledger-entries-list'
import type { EntriesFilters } from '#shared/utils/ledger-entries-list'
import type { RevenueBySource, SeasonSummary } from '#shared/utils/season-dashboard'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Money dashboard', middleware: 'console', docs: '/docs/money' })

const request = useRequestFetch()

const periodForm = await useFinancePeriodForm('finance-period-choices')
const query = periodForm.query

const { data, status, error } = await useAsyncData(
  'season-summary',
  () => request<{ summary: SeasonSummary }>('/api/admin/finance/season', { query: query.value }).then(response => response.summary),
  { watch: [query] },
)

const summaryFailure = computed(() => (error.value ? refusalText(error.value, 'The dashboard could not be read.') : null))

const mayDrillDown = computed(() => can(useViewer().value, viewFinanceReports))

// The drill-down page owns its own declaration (K-129): the range travels as its happenedAt
// filter, and each figure the filters its own query uses, so the list adds up to it (issue 1361).
function entriesUrl(filters: EntriesFilters = {}): string {
  return data.value ? entriesHref(data.value, filters) : '/money/entries'
}

const UButton = resolveComponent('UButton')

// The total row is the summary's own figure, the ledger's sum over the same lines (0004). A footer
// cell takes the header's class, so the figures' columns right-align both.
const RIGHT_FOOTED = { class: { th: 'text-right', td: RIGHT_ALIGNED.class.td } }

const revenueColumns = computed<TableColumn<RevenueBySource>[]>(() => [
  { id: 'source', header: 'Source', footer: 'Total', cell: ({ row }) => saysEntrySource(row.original.source) },
  {
    id: 'amount',
    header: 'Amount',
    meta: RIGHT_FOOTED,
    footer: () => h('span', { 'class': 'font-mono', 'data-test': 'revenue-total' }, saysMoney(data.value?.revenueTotalPence ?? 0)),
    cell: ({ row }) => saysMoney(row.original.totalPence),
  },
  ...(mayDrillDown.value
    ? [{
        id: 'act',
        header: ACTIONS_HEADER,
        // The footer's button sits in a th, so it takes the cells' face and alignment too.
        meta: { class: { th: RIGHT_ALIGNED.class.td, td: RIGHT_ALIGNED.class.td } },
        footer: () => h(UButton, { size: 'sm', variant: 'subtle', to: entriesUrl({ tender: 'CARD' }) }, () => 'Entries'),
        cell: ({ row }: { row: { original: RevenueBySource } }) => h(UButton, {
          size: 'sm',
          variant: 'subtle',
          to: entriesUrl({ source: row.original.source, tender: 'CARD' }),
        }, () => 'Entries'),
      }]
    : []),
])

// The four figures below the revenue table are one thing each, not rows of a list, so they read
// as a description list (design language rule 6).
const figures = computed(() => (data.value
  ? [
      { label: 'Refunds', test: 'refunds-pence', pence: data.value.refundsPence, to: entriesUrl({ kind: 'REFUND', tender: 'CARD' }) },
      { label: 'Forgone comps', test: 'comps-pence', pence: data.value.compsPence, to: entriesUrl({ tender: 'COMP' }) },
      { label: 'Forgone discounts', test: 'discounts-pence', pence: data.value.discountsPence, to: entriesUrl({ discounted: true }) },
      // An open variance is made of nights, each listed and linked in Needs you above; none is none.
      { label: 'Open variance', test: 'open-variance-pence', pence: data.value.openVariancePence, to: data.value.openVariancePence === 0 ? null : '#nights-needing-you' },
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

    <MoneyNightsNeedingYou />

    <UAlert
      v-if="summaryFailure"
      data-test="summary-failure"
      color="error"
      variant="subtle"
      :description="summaryFailure"
    />

    <template v-else-if="status !== 'pending' && data">
      <p class="text-sm text-muted">
        {{ saysDay(data.fromDay, { year: true }) }} to {{ saysDay(data.toDay, { year: true }) }}
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
              <ULink
                v-if="mayDrillDown && figure.to"
                :to="figure.to"
                class="underline underline-offset-4"
                :data-test="`${figure.test}-link`"
                :aria-label="`${figure.label}: ${saysMoney(figure.pence)}, open what it is made of`"
              >
                {{ saysMoney(figure.pence) }}
              </ULink>
              <template v-else>
                {{ saysMoney(figure.pence) }}
              </template>
            </dd>
          </div>
        </dl>
        <p
          v-if="data.unreconciledNights > 0"
          class="text-sm text-warning"
          data-test="unreconciled-nights"
        >
          The open variance leaves out {{ plural(data.unreconciledNights, 'night') }} in this period with no Z
          reading yet, so their variance is not known.
          <ULink
            v-if="mayDrillDown"
            to="/money/reconciliation"
            class="underline"
          >Reconcile them</ULink>
        </p>
      </section>
    </template>
  </div>
</template>
