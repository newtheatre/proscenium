<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { PERIOD_KINDS } from '#shared/utils/season-dashboard'
import { can, viewFinanceReports } from '#shared/utils/abilities'
import type { PeriodInput, SeasonSummary } from '#shared/utils/season-dashboard'

definePageMeta({ layout: 'console', title: 'Season dashboard', middleware: 'console' })

const request = useRequestFetch()

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const currentYear = new Date().getFullYear()
// TERM has a range, not a formula, so it needs its own picker over I-107's defined terms;
// this screen offers only the kinds a year and a day already answer, until that picker exists.
const SELECTABLE_PERIOD_KINDS = PERIOD_KINDS.filter(one => one !== 'TERM')
const kind = ref<(typeof SELECTABLE_PERIOD_KINDS)[number]>('SEASON')
const day = ref(today)
const year = ref(currentYear)
const month = ref(new Date().getMonth() + 1)

const period = computed<PeriodInput>(() => {
  if (kind.value === 'DAY') return { kind: 'DAY', day: day.value }
  if (kind.value === 'WEEK') return { kind: 'WEEK', day: day.value }
  if (kind.value === 'MONTH') return { kind: 'MONTH', year: year.value, month: month.value }
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

function entriesUrl(source?: string): string {
  const params = new URLSearchParams(query.value)
  if (source) params.set('source', source)
  return `/money/entries?${params.toString()}`
}
</script>

<template>
  <div class="space-y-6">
    <AdminToolbar :filterable="false">
      <template #actions>
        <USelect
          v-model="kind"
          aria-label="Period kind"
          data-test="period-kind"
          :items="[...SELECTABLE_PERIOD_KINDS]"
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
              </th><th>Pence</th><th v-if="mayDrillDown" />
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
