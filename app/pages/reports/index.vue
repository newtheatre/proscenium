<script setup lang="ts">
import { h } from 'vue'
import { saysCategory, saysSeverity } from '#shared/utils/incidents'
import { saysOpeningBypass } from '#shared/utils/season-reports'
import { saysDay, saysWhen } from '#shared/utils/when'
import type { IncidentTrendRow, OpeningBypassRow, PerformanceReportRow } from '#shared/utils/season-reports'
import type { PeriodChoices } from '#shared/utils/season-dashboard'
import { DEFAULT_PAGE_SIZE } from '#shared/utils/pagination'
import type { Page } from '#shared/utils/pagination'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Night reports', middleware: 'console', docs: '/docs/reports' })

type Report = 'incidents' | 'performances'

const route = useRoute()
const request = useRequestFetch()

// The terms and seasons come through the reports gate, so no finance permission is needed here.
const periodForm = await usePeriodForm('reports-period-choices', () => request<PeriodChoices>('/api/admin/reports/periods'))
const query = periodForm.query

// The open tab lives in the URL, so a link to the performances tab lands on it (0032).
const tab = computed<string | number>({
  get: (): Report => (route.query.tab === 'performances' ? 'performances' : 'incidents'),
  set: (value) => {
    void navigateTo({ query: { ...route.query, tab: value === 'performances' ? value : undefined } }, { replace: true })
  },
})

const tabs = [
  { label: 'Incidents', value: 'incidents', slot: 'incidents' as const },
  { label: 'Performances', value: 'performances', slot: 'performances' as const },
]

const incidentsPage = ref(1)
const performancesPage = ref(1)
watch(query, () => {
  incidentsPage.value = 1
  performancesPage.value = 1
})

function empty<T>(): Page<T> {
  return { items: [], page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, pages: 1 }
}

const { data: incidents, status: incidentsStatus, error: incidentsError } = await useAsyncData(
  'reports-incidents',
  () => request<Page<IncidentTrendRow>>('/api/admin/reports/incidents', { query: { ...query.value, page: incidentsPage.value } }),
  { watch: [query, incidentsPage], default: empty<IncidentTrendRow> },
)

const { data: performances, status: performancesStatus, error: performancesError } = await useAsyncData(
  'reports-performances',
  () => request<Page<PerformanceReportRow>>('/api/admin/reports/performances', { query: { ...query.value, page: performancesPage.value } }),
  { watch: [query, performancesPage], default: empty<PerformanceReportRow> },
)

// No night report carries a bypass at a venue with nothing on, so this list does (E-130 criterion 6).
const { data: openingBypasses, error: openingBypassesError } = await useAsyncData(
  'reports-opening-bypasses',
  () => request<OpeningBypassRow[]>('/api/admin/reports/opening-bypasses', { query: query.value }),
  { watch: [query], default: (): OpeningBypassRow[] => [] },
)

const incidentsFailure = useListFailure(incidentsError, 'The incident report could not be read.')
const performancesFailure = useListFailure(performancesError, 'The performance report could not be read.')
const openingBypassesFailure = useListFailure(openingBypassesError, 'The officers standing in with no performance could not be read.')

function exportUrl(report: Report): string {
  return `/api/admin/reports/${report}/export?${new URLSearchParams(query.value).toString()}`
}

const incidentColumns: TableColumn<IncidentTrendRow>[] = [
  { id: 'venue', header: 'Venue', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => row.original.venueName },
  {
    id: 'category',
    header: 'Category',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, saysCategory(row.original.category)),
      h('div', { class: 'sm:hidden text-xs text-muted' }, row.original.venueName),
    ]),
  },
  { id: 'severity', header: 'Severity', cell: ({ row }) => saysSeverity(row.original.severity) },
  { id: 'count', header: 'Count', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.count) },
]

const yesNo = (value: boolean): string => (value ? 'Yes' : 'No')

const performanceColumns: TableColumn<PerformanceReportRow>[] = [
  {
    id: 'performance',
    header: 'Performance',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.showTitle),
      h('div', { class: 'text-xs text-muted' }, `${saysWhen(row.original.startsAt)}, ${row.original.venueName}`),
    ]),
  },
  { id: 'sold', header: 'Sold', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.sold) },
  { id: 'admitted', header: 'Admitted', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.admitted) },
  { id: 'noShows', header: 'No-shows', meta: RIGHT_ALIGNED_HIDE_BELOW_SM, cell: ({ row }) => String(row.original.noShows) },
  { id: 'unfilledSlots', header: 'Unfilled slots', meta: RIGHT_ALIGNED_HIDE_BELOW_SM, cell: ({ row }) => String(row.original.unfilledSlots) },
  { id: 'officerBypass', header: 'Officer bypass', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => yesNo(row.original.officerBypass) },
  { id: 'autoClosed', header: 'Closed automatically', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => yesNo(row.original.autoClosed) },
]
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

    <UTabs
      v-model="tab"
      :items="tabs"
      variant="link"
    >
      <template #incidents>
        <section
          class="mt-4 space-y-3"
          data-test="section-incidents"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-muted">
              Incidents and near misses, counted by venue, category and severity.
            </p>
            <UButton
              data-test="export-incidents"
              size="sm"
              color="neutral"
              variant="subtle"
              icon="i-lucide-download"
              :to="exportUrl('incidents')"
              external
              target="_blank"
            >
              Export CSV
            </UButton>
          </div>

          <UAlert
            v-if="incidentsFailure"
            data-test="incidents-failure"
            color="error"
            variant="subtle"
            :description="incidentsFailure.message"
            :actions="incidentsFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: incidentsFailure.enrolPath, color: 'error' }] : []"
          />

          <UTable
            v-else
            :data="incidents.items"
            :columns="incidentColumns"
            :loading="incidentsStatus === 'pending'"
            data-test="incidents-table"
          >
            <template #empty>
              <p class="py-6 text-center text-sm text-muted">
                Nothing was logged in this period.
              </p>
            </template>
          </UTable>

          <UPagination
            v-if="incidents.pages > 1"
            v-model:page="incidentsPage"
            :total="incidents.total"
            :items-per-page="incidents.pageSize"
          />
        </section>
      </template>

      <template #performances>
        <section
          class="mt-4 space-y-3"
          data-test="section-performances"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-muted">
              Every performance in the period, with its attendance and its staffing.
            </p>
            <UButton
              data-test="export-performances"
              size="sm"
              color="neutral"
              variant="subtle"
              icon="i-lucide-download"
              :to="exportUrl('performances')"
              external
              target="_blank"
            >
              Export CSV
            </UButton>
          </div>

          <UAlert
            v-if="performancesFailure"
            data-test="performances-failure"
            color="error"
            variant="subtle"
            :description="performancesFailure.message"
            :actions="performancesFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: performancesFailure.enrolPath, color: 'error' }] : []"
          />

          <UTable
            v-else
            :data="performances.items"
            :columns="performanceColumns"
            :loading="performancesStatus === 'pending'"
            data-test="performances-table"
          >
            <template #empty>
              <p class="py-6 text-center text-sm text-muted">
                No performance in this period.
              </p>
            </template>
          </UTable>

          <UPagination
            v-if="performances.pages > 1"
            v-model:page="performancesPage"
            :total="performances.total"
            :items-per-page="performances.pageSize"
          />

          <UAlert
            v-if="openingBypassesFailure && !performancesFailure"
            data-test="opening-bypasses-failure"
            color="error"
            variant="subtle"
            :description="openingBypassesFailure.message"
          />

          <div
            v-else-if="openingBypasses.length > 0"
            class="space-y-2"
            data-test="opening-bypasses"
          >
            <h3 class="text-sm font-medium">
              Officers standing in with no performance
            </h3>
            <p class="text-sm text-muted">
              A bar opened on a night with no performance at that venue has no night report, so each
              officer who stood in is listed here.
            </p>
            <ul class="space-y-1 text-sm">
              <li
                v-for="(bypass, index) in openingBypasses"
                :key="`${bypass.night}-${bypass.venueId}-${bypass.role}-${index}`"
              >
                <UBadge
                  color="warning"
                  variant="subtle"
                  size="sm"
                  class="text-left whitespace-normal"
                >
                  {{ saysDay(bypass.night) }}: {{ saysOpeningBypass(bypass) }}
                </UBadge>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </UTabs>
  </div>
</template>
