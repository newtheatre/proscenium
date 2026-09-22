<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { PERIOD_KINDS } from '#shared/utils/season-dashboard'
import { can, viewFinanceReports } from '#shared/utils/abilities'
import { currentSeasonYear, monthChoices, seasonChoices, yearChoices } from '#shared/utils/season'
import type { PeriodInput, PeriodKind, RevenueBySource, SeasonSummary } from '#shared/utils/season-dashboard'
import type { Period } from '#shared/utils/period-locks'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Season dashboard', middleware: 'console', docs: '/docs/money' })

const request = useRequestFetch()

const today = londonDay(new Date())
const currentYear = currentSeasonYear()
const { data: terms } = await useAsyncData(
  'finance-terms',
  () => request<{ periods: Period[] }>('/api/admin/finance/terms').then(response => response.periods),
  { default: (): Period[] => [] },
)

// TERM has a range rather than a formula, so it is offered only once I-107 has a term to pick;
// the range submitted is the defined term's own, never a rule this screen computes.
const selectableKinds = computed(() => PERIOD_KINDS.filter(one => one !== 'TERM' || terms.value.length > 0))
const termItems = computed(() => terms.value.map(one => ({ label: one.label, value: one.id })))
const kind = ref<PeriodKind>('SEASON')
const termId = ref(terms.value[0]?.id ?? '')
const day = ref(today)
const year = ref(currentYear)
// A month's year is a calendar year and a season's is the year it ends in, so they are two
// controls and two lists, never one number standing for both.
const monthYear = ref(Number(today.slice(0, 4)))
const month = ref(Number(today.slice(5, 7)))

const months = monthChoices()
const seasons = seasonChoices(currentYear)
const years = yearChoices(Number(today.slice(0, 4)))

const term = computed(() => terms.value.find(one => one.id === termId.value) ?? terms.value[0])

const period = computed<PeriodInput>(() => {
  if (kind.value === 'DAY') return { kind: 'DAY', day: day.value }
  if (kind.value === 'WEEK') return { kind: 'WEEK', day: day.value }
  if (kind.value === 'MONTH') return { kind: 'MONTH', year: monthYear.value, month: month.value }
  if (kind.value === 'TERM' && term.value) return { kind: 'TERM', fromDay: term.value.fromDay, toDay: term.value.toDay }
  return { kind: 'SEASON', year: year.value }
})

const query = computed(() => {
  const base: Record<string, string> = { kind: period.value.kind }
  if (period.value.kind === 'DAY' || period.value.kind === 'WEEK') base.day = period.value.day
  else if (period.value.kind === 'MONTH') {
    base.year = String(period.value.year)
    base.month = String(period.value.month)
  }
  else if (period.value.kind === 'SEASON') base.year = String(period.value.year)
  else {
    base.fromDay = period.value.fromDay
    base.toDay = period.value.toDay
  }
  return base
})

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
        <USelect
          v-model="kind"
          aria-label="Period kind"
          data-test="period-kind"
          :items="selectableKinds"
        />
        <USelect
          v-if="kind === 'TERM'"
          v-model="termId"
          aria-label="Term"
          data-test="period-term"
          :items="termItems"
          value-key="value"
        />
        <DateField
          v-if="kind === 'DAY' || kind === 'WEEK'"
          v-model="day"
          data-test="period-day"
        />
        <USelect
          v-if="kind === 'MONTH'"
          v-model="month"
          aria-label="Month"
          data-test="period-month"
          :items="months"
          value-key="value"
        />
        <USelect
          v-if="kind === 'MONTH'"
          v-model="monthYear"
          aria-label="Year"
          data-test="period-year"
          :items="years"
          value-key="value"
        />
        <USelect
          v-if="kind === 'SEASON'"
          v-model="year"
          aria-label="Season"
          data-test="period-season"
          :items="seasons"
          value-key="value"
        />
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
