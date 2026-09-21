<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { PERIOD_KINDS } from '#shared/utils/season-dashboard'
import { can, viewFinanceReports } from '#shared/utils/abilities'
import { currentSeasonYear } from '#shared/utils/season'
import type { PeriodInput, PeriodKind, SeasonSummary } from '#shared/utils/season-dashboard'
import type { Period } from '#shared/utils/period-locks'

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
const month = ref(new Date().getMonth() + 1)

const term = computed(() => terms.value.find(one => one.id === termId.value) ?? terms.value[0])

const period = computed<PeriodInput>(() => {
  if (kind.value === 'DAY') return { kind: 'DAY', day: day.value }
  if (kind.value === 'WEEK') return { kind: 'WEEK', day: day.value }
  if (kind.value === 'MONTH') return { kind: 'MONTH', year: year.value, month: month.value }
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

const { data, status, error, refresh } = await useAsyncData(
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
        <UInputNumber
          v-if="kind === 'MONTH'"
          v-model="month"
          aria-label="Month"
          data-test="period-month"
        />
        <UInputNumber
          v-if="kind === 'MONTH' || kind === 'SEASON'"
          v-model="year"
          aria-label="Year"
          data-test="period-year"
        />
        <UButton
          data-test="refresh-summary"
          variant="subtle"
          @click="refresh()"
        >
          Refresh
        </UButton>
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
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Source
              </th><th>Amount</th><th v-if="mayDrillDown" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.revenueBySource"
              :key="row.source"
              data-test="revenue-row"
            >
              <td class="py-2">
                {{ row.source }}
              </td>
              <td>{{ saysMoney(row.totalPence) }}</td>
              <td v-if="mayDrillDown">
                <UButton
                  size="sm"
                  variant="subtle"
                  :to="entriesUrl(row.source)"
                >
                  Entries
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section
        class="space-y-2"
        data-test="section-figures"
      >
        <table class="w-full text-sm">
          <tbody>
            <tr>
              <td class="py-2">
                Refunds
              </td>
              <td data-test="refunds-pence">
                {{ saysMoney(data.refundsPence) }}
              </td>
            </tr>
            <tr>
              <td class="py-2">
                Foregone comps
              </td>
              <td data-test="comps-pence">
                {{ saysMoney(data.compsPence) }}
              </td>
            </tr>
            <tr>
              <td class="py-2">
                Foregone discounts
              </td>
              <td data-test="discounts-pence">
                {{ saysMoney(data.discountsPence) }}
              </td>
            </tr>
            <tr>
              <td class="py-2">
                Open variance
              </td>
              <td data-test="open-variance-pence">
                {{ saysMoney(data.openVariancePence) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
