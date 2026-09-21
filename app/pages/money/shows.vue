<script setup lang="ts">
import { h } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { currentSeasonYear } from '#shared/utils/season'
import type { PassUtilisationRow, RevenueByShowReport, ShowRevenueRow } from '#shared/utils/revenue-by-show'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Revenue by show', middleware: 'console', docs: '/docs/money/revenue-by-show' })

const request = useRequestFetch()

const year = ref(currentSeasonYear())

// The season, always: a treasurer comparing shows reads them within one season at a time.
const query = computed(() => ({ kind: 'SEASON', year: String(year.value) }))

const { data, status, error, refresh } = await useAsyncData(
  'revenue-by-show',
  () => request<{ report: RevenueByShowReport }>('/api/admin/finance/revenue-by-show', { query: query.value }).then(response => response.report),
  { watch: [query] },
)

const reportFailure = computed(() => (error.value ? refusalText(error.value, 'The report could not be read.') : null))

// Money with no performance link is still money, so it reads as a row of the same table rather
// than as a note beside it. Its walk-up split is not knowable, so those cells stay empty.
type ShowRow = ShowRevenueRow & { unattributed?: boolean }

const showRows = computed<ShowRow[]>(() => {
  if (!data.value) return []
  const rows: ShowRow[] = [...data.value.byShow]
  const spare = data.value.unattributed
  if (spare.grossPence !== 0 || spare.refundedPence !== 0) {
    rows.push({
      showId: 'unattributed',
      showTitle: 'Unattributed (no performance link)',
      grossPence: spare.grossPence,
      refundedPence: spare.refundedPence,
      netPence: spare.netPence,
      walkUpPence: 0,
      preBookedPence: 0,
      passAdmissions: 0,
      unattributed: true,
    })
  }
  return rows
})

const showColumns: TableColumn<ShowRow>[] = [
  {
    id: 'show',
    header: 'Show',
    cell: ({ row }) => h('span', {
      'class': row.original.unattributed ? 'italic' : undefined,
      'data-test': row.original.unattributed ? 'unattributed-row' : 'show-row',
    }, row.original.showTitle),
  },
  { id: 'gross', header: 'Gross', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.grossPence) },
  { id: 'refunded', header: 'Refunded', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.refundedPence) },
  { id: 'net', header: 'Net', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.netPence) },
  { id: 'walkUp', header: 'Walk-up', meta: RIGHT_ALIGNED, cell: ({ row }) => (row.original.unattributed ? '' : saysMoney(row.original.walkUpPence)) },
  { id: 'preBooked', header: 'Pre-booked', meta: RIGHT_ALIGNED, cell: ({ row }) => (row.original.unattributed ? '' : saysMoney(row.original.preBookedPence)) },
  {
    id: 'passAdmissions',
    header: 'Pass admissions',
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => (row.original.unattributed ? '' : String(row.original.passAdmissions)),
  },
]

const passColumns: TableColumn<PassUtilisationRow>[] = [
  { id: 'reference', header: 'Pass', cell: ({ row }) => row.original.reference },
  { id: 'passTypeName', header: 'Type', cell: ({ row }) => row.original.passTypeName },
  { id: 'pricePaid', header: 'Paid', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.pricePaid) },
  { id: 'admittedShows', header: 'Shows admitted', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.admittedShows) },
  { id: 'coveredShows', header: 'Shows covered', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.coveredShows) },
]
</script>

<template>
  <div class="space-y-6">
    <AdminToolbar
      :filterable="false"
      :searchable="false"
    >
      <template #actions>
        <UInputNumber
          v-model="year"
          aria-label="Season year"
          data-test="season-year"
        />
        <UButton
          data-test="refresh-revenue"
          variant="subtle"
          @click="refresh()"
        >
          Refresh
        </UButton>
      </template>
    </AdminToolbar>

    <UAlert
      v-if="reportFailure"
      data-test="report-failure"
      color="error"
      variant="subtle"
      :description="reportFailure"
    />

    <template v-else-if="status !== 'pending' && data">
      <p class="text-sm text-muted">
        {{ saysDay(data.fromDay) }} to {{ saysDay(data.toDay) }}
      </p>

      <UTable
        :data="showRows"
        :columns="showColumns"
        data-test="revenue-by-show-table"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            Nothing was taken for a show in this season.
          </p>
        </template>
      </UTable>

      <section
        v-if="data.passes.length > 0"
        class="space-y-2"
        data-test="section-passes"
      >
        <h2 class="font-semibold">
          Pass utilisation
        </h2>
        <UTable
          :data="data.passes"
          :columns="passColumns"
          data-test="pass-utilisation-table"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              No pass has been used in this season.
            </p>
          </template>
        </UTable>
      </section>
    </template>
  </div>
</template>
