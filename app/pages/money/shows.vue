<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import type { RevenueByShowReport } from '#shared/utils/revenue-by-show'

definePageMeta({ layout: 'console', title: 'Revenue by show', middleware: 'console' })

const request = useRequestFetch()

const year = ref(new Date().getFullYear())

// The season, always: a treasurer comparing shows reads them within one season at a time.
const query = computed(() => ({ kind: 'SEASON', year: String(year.value) }))

const { data, status, error, refresh } = await useAsyncData(
  'revenue-by-show',
  () => request<{ report: RevenueByShowReport }>('/api/admin/finance/revenue-by-show', { query: query.value }).then(response => response.report),
  { watch: [query] },
)

const reportFailure = computed(() => (error.value ? refusalText(error.value, 'The report could not be read.') : null))
</script>

<template>
  <div class="space-y-6">
    <AdminToolbar :filterable="false">
      <template #actions>
        <UInputNumber
          v-model="year"
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
        {{ data.fromDay }} to {{ data.toDay }}
      </p>

      <table class="w-full text-sm">
        <thead>
          <tr class="border-b text-left text-muted">
            <th class="py-2">
              Show
            </th><th>Gross</th><th>Refunded</th><th>Net</th><th>Walk-up</th><th>Pre-booked</th><th>Pass admissions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in data.byShow"
            :key="row.showId"
            data-test="show-row"
          >
            <td class="py-2">
              {{ row.showTitle }}
            </td>
            <td>{{ saysMoney(row.grossPence) }}</td>
            <td>{{ saysMoney(row.refundedPence) }}</td>
            <td>{{ saysMoney(row.netPence) }}</td>
            <td>{{ saysMoney(row.walkUpPence) }}</td>
            <td>{{ saysMoney(row.preBookedPence) }}</td>
            <td>{{ row.passAdmissions }}</td>
          </tr>
          <tr
            v-if="data.unattributed.grossPence !== 0 || data.unattributed.refundedPence !== 0"
            data-test="unattributed-row"
          >
            <td class="py-2 italic">
              Unattributed (no performance link)
            </td>
            <td>{{ saysMoney(data.unattributed.grossPence) }}</td>
            <td>{{ saysMoney(data.unattributed.refundedPence) }}</td>
            <td>{{ saysMoney(data.unattributed.netPence) }}</td>
            <td />
            <td />
            <td />
          </tr>
        </tbody>
      </table>

      <section
        v-if="data.passes.length > 0"
        class="space-y-2"
        data-test="section-passes"
      >
        <h2 class="font-semibold">
          Pass utilisation
        </h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Pass
              </th><th>Type</th><th>Paid</th><th>Shows admitted</th><th>Shows covered</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.passes"
              :key="row.passId"
              data-test="pass-row"
            >
              <td class="py-2">
                {{ row.reference }}
              </td>
              <td>{{ row.passTypeName }}</td>
              <td>{{ saysMoney(row.pricePaid) }}</td>
              <td>{{ row.admittedShows }}</td>
              <td>{{ row.coveredShows }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
