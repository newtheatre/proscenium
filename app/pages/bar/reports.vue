<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { REPORT_PERIOD_KINDS } from '#shared/utils/bar-reports'
import type { BarReport, ReportPeriodInput, ReportSection } from '#shared/utils/bar-reports'

definePageMeta({ layout: 'console', title: 'Bar reports', middleware: 'console' })

const request = useRequestFetch()

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
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

const reportFailure = computed(() => (error.value ? refusalText(error.value, 'The report could not be read.') : null))

function exportUrl(section: ReportSection): string {
  const params = new URLSearchParams({ ...query.value, section })
  return `/api/admin/bar/reports/export?${params.toString()}`
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
          data-test="period-kind"
          :items="[...REPORT_PERIOD_KINDS]"
        />
        <DateField
          v-if="kind === 'NIGHT'"
          v-model="night"
          data-test="period-night"
        />
        <DateField
          v-if="kind === 'WEEK'"
          v-model="day"
          data-test="period-week"
        />
        <UInputNumber
          v-if="kind === 'SEASON'"
          v-model="year"
          data-test="period-season"
        />
        <template v-if="kind === 'CUSTOM'">
          <DateField
            v-model="from"
            data-test="period-from"
          />
          <DateField
            v-model="to"
            data-test="period-to"
          />
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
      :description="reportFailure"
    />

    <template v-else-if="status !== 'pending' && data">
      <section
        v-for="section in ([
          ['sales', 'Sales'], ['gp', 'Gross profit'], ['variance', 'Stocktake variance'],
          ['comps', 'Comps'], ['discounts', 'Discounts'],
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

        <table
          v-if="section[0] === 'sales'"
          class="w-full text-sm"
        >
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Category
              </th><th>Product</th><th>Variant</th><th>Qty</th><th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.sales"
              :key="`${row.categoryName}-${row.productName}-${row.variantLabel}`"
              class="border-b last:border-0"
            >
              <td class="py-2">
                {{ row.categoryName }}
              </td><td>{{ row.productName }}</td><td>{{ row.variantLabel }}</td>
              <td>{{ row.qty }}</td><td>{{ saysMoney(row.revenuePence) }}</td>
            </tr>
          </tbody>
        </table>

        <div v-else-if="section[0] === 'gp'">
          <p
            class="text-sm"
            data-test="gp-summary"
          >
            Revenue {{ saysMoney(data.gp.revenuePence) }}, cost {{ saysMoney(data.gp.costPence) }},
            gross profit {{ saysMoney(data.gp.grossProfitPence) }}
          </p>
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left text-muted">
                <th class="py-2">
                  Item
                </th><th>Qty depleted</th><th>Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.gp.byItem"
                :key="row.itemName"
                class="border-b last:border-0"
              >
                <td class="py-2">
                  {{ row.itemName }}
                </td><td>{{ row.qtyDepleted }}</td><td>{{ saysMoney(row.costPence) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <table
          v-else-if="section[0] === 'variance'"
          class="w-full text-sm"
        >
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Item
              </th><th>Qty variance</th><th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.variance"
              :key="`${row.stocktakeId}-${row.itemName}`"
              class="border-b last:border-0"
            >
              <td class="py-2">
                {{ row.itemName }}
              </td><td>{{ row.qtyVariance }}</td><td>{{ saysMoney(row.valuePence) }}</td>
            </tr>
          </tbody>
        </table>

        <table
          v-else-if="section[0] === 'comps'"
          class="w-full text-sm"
        >
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Reason
              </th><th>Approved by</th><th>Foregone</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.comps"
              :key="row.entryId"
              class="border-b last:border-0"
            >
              <td class="py-2">
                {{ row.reason }}
              </td><td>{{ row.approvedByName }}</td><td>{{ saysMoney(row.foregonePence) }}</td>
            </tr>
          </tbody>
        </table>

        <table
          v-else
          class="w-full text-sm"
        >
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Discount
              </th><th>Percent</th><th>Times applied</th><th>Given away</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.discounts"
              :key="row.discountId"
              class="border-b last:border-0"
            >
              <td class="py-2">
                {{ row.discountName }}
              </td><td>{{ row.percent }}%</td><td>{{ row.timesApplied }}</td>
              <td>{{ saysMoney(row.discountedPence) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
