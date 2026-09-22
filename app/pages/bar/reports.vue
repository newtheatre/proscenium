<script setup lang="ts">
import { h } from 'vue'
import { says, saysMoney, saysQuantity } from '#shared/utils/bar'
import { REPORT_PERIOD_KINDS, saysPageOf } from '#shared/utils/bar-reports'
import type {
  BarReport,
  CompRow,
  DiscountRow,
  GpRow,
  ReportPeriodInput,
  ReportPeriodKind,
  ReportSection,
  SalesRow,
  VarianceRow,
  WastageRow,
} from '#shared/utils/bar-reports'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Reports', middleware: 'console', docs: '/docs/bar/reports' })

// Words, not the enum's own shouting-capitals spelling: the same treatment every other bar
// screen gives a stored value (K-101).
function saysReportPeriod(value: ReportPeriodKind): string {
  return value === 'NIGHT' ? 'Night' : value === 'WEEK' ? 'Week' : value === 'SEASON' ? 'Season' : 'Custom range'
}

const periodKindOptions = REPORT_PERIOD_KINDS.map(value => ({ label: saysReportPeriod(value), value }))

const request = useRequestFetch()

const today = londonDay(new Date())
const kind = ref<(typeof REPORT_PERIOD_KINDS)[number]>('CUSTOM')
const night = ref(today)
const day = ref(today)
const year = ref(new Date().getFullYear())
const from = ref(today)
const to = ref(today)

const period = computed<ReportPeriodInput>(() => {
  if (kind.value === 'NIGHT') return { kind: 'NIGHT', night: night.value }
  if (kind.value === 'WEEK') return { kind: 'WEEK', day: day.value }
  if (kind.value === 'SEASON') return { kind: 'SEASON', year: year.value }
  return { kind: 'CUSTOM', from: from.value, to: to.value }
})

const query = computed(() => {
  const base: Record<string, string> = { kind: period.value.kind }
  if (period.value.kind === 'NIGHT') base.night = period.value.night
  else if (period.value.kind === 'WEEK') base.day = period.value.day
  else if (period.value.kind === 'SEASON') base.year = String(period.value.year)
  else {
    base.from = period.value.from
    base.to = period.value.to
  }
  return base
})

const { data, status, error, refresh } = await useAsyncData(
  'bar-report',
  () => request<{ report: BarReport }>('/api/admin/bar/reports', { query: query.value }).then(response => response.report),
  { watch: [query] },
)

const reportFailure = useListFailure(error, 'The report could not be read.')
const loading = computed(() => status.value === 'pending')

// Comps and variance are the two sections that page; the rest answer whole and say nothing.
function saysMoreOf(section: ReportSection): string {
  const paged = section === 'comps' ? data.value?.comps : section === 'variance' ? data.value?.variance : null
  return paged && paged.pages > 1 ? saysPageOf(paged) : ''
}

function exportUrl(section: ReportSection): string {
  const params = new URLSearchParams({ ...query.value, section })
  return `/api/admin/bar/reports/export?${params.toString()}`
}

const salesColumns: TableColumn<SalesRow>[] = [
  { id: 'category', header: 'Product category', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => row.original.categoryName },
  {
    id: 'product',
    header: 'Product',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.productName),
      // Below sm the product category and the size are hidden: shown here instead, so a phone keeps
      // the figures in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${row.original.variantLabel}, ${row.original.categoryName}`),
    ]),
  },
  { id: 'variant', header: 'Serving size', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => row.original.variantLabel },
  { id: 'qty', header: 'Qty', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.qty) },
  { id: 'revenue', header: 'Revenue', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.revenuePence) },
]

const gpColumns: TableColumn<GpRow>[] = [
  { id: 'item', header: 'Item', cell: ({ row }) => row.original.itemName },
  { id: 'qty', header: 'Qty depleted', meta: RIGHT_ALIGNED, cell: ({ row }) => saysQuantity(row.original.qtyDepleted, row.original.unit) },
  { id: 'cost', header: 'Cost', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.costPence) },
]

const varianceColumns: TableColumn<VarianceRow>[] = [
  { id: 'item', header: 'Item', cell: ({ row }) => row.original.itemName },
  { id: 'qty', header: 'Qty variance', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.qtyVariance) },
  { id: 'value', header: 'Value', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.valuePence) },
]

const compsColumns: TableColumn<CompRow>[] = [
  { id: 'reason', header: 'Reason', cell: ({ row }) => row.original.reason },
  { id: 'approvedBy', header: 'Approved by', cell: ({ row }) => row.original.approvedByName },
  { id: 'foregone', header: 'Forgone', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.foregonePence) },
]

const wastageColumns: TableColumn<WastageRow>[] = [
  {
    id: 'reason',
    header: 'Reason',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, says(row.original.reason)),
      // Below sm the item and its product category are hidden: shown here instead, so a phone keeps the
      // figures in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${row.original.itemName}, ${row.original.categoryName}`),
    ]),
  },
  { id: 'item', header: 'Item', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => row.original.itemName },
  { id: 'category', header: 'Product category', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } }, cell: ({ row }) => row.original.categoryName },
  { id: 'qty', header: 'Qty', meta: RIGHT_ALIGNED, cell: ({ row }) => saysQuantity(row.original.qtyWasted, row.original.unit) },
  { id: 'cost', header: 'At cost', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.costPence) },
]

const discountsColumns: TableColumn<DiscountRow>[] = [
  {
    id: 'discount',
    header: 'Discount',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.discountName),
      // Below sm the percentage and the count are hidden: shown here instead, so a phone keeps
      // the money in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${row.original.percent}%, applied ${plural(row.original.timesApplied, 'time')}`),
    ]),
  },
  { id: 'percent', header: 'Percent', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } }, cell: ({ row }) => `${row.original.percent}%` },
  { id: 'timesApplied', header: 'Times applied', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } }, cell: ({ row }) => String(row.original.timesApplied) },
  { id: 'givenAway', header: 'Given away', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.discountedPence) },
]
</script>

<template>
  <div class="space-y-6">
    <AdminToolbar
      :filterable="false"
      :searchable="false"
    >
      <template #actions>
        <UFormField label="Period">
          <USelect
            v-model="kind"
            data-test="period-kind"
            :items="periodKindOptions"
          />
        </UFormField>
        <UFormField
          v-if="kind === 'NIGHT'"
          label="Night"
        >
          <DateField
            v-model="night"
            data-test="period-night"
          />
        </UFormField>
        <UFormField
          v-if="kind === 'WEEK'"
          label="Week of"
        >
          <DateField
            v-model="day"
            data-test="period-week"
          />
        </UFormField>
        <UFormField
          v-if="kind === 'SEASON'"
          label="Season"
        >
          <UInputNumber
            v-model="year"
            data-test="period-season"
          />
        </UFormField>
        <template v-if="kind === 'CUSTOM'">
          <UFormField label="From">
            <DateField
              v-model="from"
              data-test="period-from"
            />
          </UFormField>
          <UFormField label="To">
            <DateField
              v-model="to"
              data-test="period-to"
            />
          </UFormField>
        </template>
        <UButton
          data-test="refresh-report"
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
      :description="reportFailure.message"
      :actions="reportFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: reportFailure.enrolPath, color: 'error' }] : []"
    />

    <!-- Data stays on screen while a new period refetches, rather than blanking (0032). -->
    <template v-else-if="data">
      <section
        v-for="section in ([
          ['sales', 'Sales'], ['gp', 'Gross profit'], ['variance', 'Stocktake variance'],
          ['comps', 'Comps'], ['discounts', 'Discounts'], ['wastage', 'Wastage'],
        ] as const)"
        :key="section[0]"
        class="space-y-2"
        :data-test="`section-${section[0]}`"
      >
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">
            {{ section[1] }}
          </h2>
          <UButton
            :data-test="`export-${section[0]}`"
            size="sm"
            color="neutral"
            variant="subtle"
            icon="i-lucide-download"
            :to="exportUrl(section[0])"
            external
            target="_blank"
          >
            Export CSV
          </UButton>
        </div>

        <UTable
          v-if="section[0] === 'sales'"
          :data="data.sales"
          :columns="salesColumns"
          :loading="loading"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              Nothing sold in this period.
            </p>
          </template>
        </UTable>

        <div v-else-if="section[0] === 'gp'">
          <p
            class="text-sm"
            data-test="gp-summary"
          >
            Revenue {{ saysMoney(data.gp.revenuePence) }}, cost {{ saysMoney(data.gp.costPence) }},
            gross profit {{ saysMoney(data.gp.grossProfitPence) }}
          </p>
          <UTable
            :data="data.gp.byItem"
            :columns="gpColumns"
            :loading="loading"
          >
            <template #empty>
              <p class="py-6 text-center text-sm text-muted">
                Nothing depleted in this period.
              </p>
            </template>
          </UTable>
        </div>

        <UTable
          v-else-if="section[0] === 'variance'"
          :data="data.variance.items"
          :columns="varianceColumns"
          :loading="loading"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              No stocktake applied in this period.
            </p>
          </template>
        </UTable>

        <UTable
          v-else-if="section[0] === 'comps'"
          :data="data.comps.items"
          :columns="compsColumns"
          :loading="loading"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              No comps given in this period.
            </p>
          </template>
        </UTable>

        <UTable
          v-else-if="section[0] === 'wastage'"
          :data="data.wastage"
          :columns="wastageColumns"
          :loading="loading"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              Nothing wasted in this period.
            </p>
          </template>
        </UTable>

        <UTable
          v-else
          :data="data.discounts"
          :columns="discountsColumns"
          :loading="loading"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              No discount applied in this period.
            </p>
          </template>
        </UTable>

        <p
          v-if="saysMoreOf(section[0])"
          class="text-sm text-muted"
          :data-test="`${section[0]}-more`"
        >
          {{ saysMoreOf(section[0]) }}
        </p>
      </section>
    </template>
  </div>
</template>
