<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysAccessKind } from '#shared/utils/ticket-types'
import type { FinanceForegoneReport } from '#shared/utils/finance-reports'

definePageMeta({ layout: 'console', title: 'Comps and discounts', middleware: 'console' })

interface ShowOption { id: string, title: string, status: string }

const request = useRequestFetch()

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const scopeKind = ref<'SHOW' | 'PERIOD'>('PERIOD')
const showId = ref<string | undefined>(undefined)
const from = ref(today)
const to = ref(today)

const { data: shows } = await useAsyncData('finance-shows', () => request<ShowOption[]>('/api/admin/finance/shows'), { default: () => [] })
const showOptions = computed(() => shows.value.map(one => ({ label: one.title, value: one.id })))

// A show scope has nothing to fetch until one is chosen; a period scope always has a range.
const ready = computed(() => scopeKind.value === 'PERIOD' || Boolean(showId.value))

const query = computed(() => (scopeKind.value === 'SHOW'
  ? { scope: 'SHOW' as const, showId: showId.value ?? '' }
  : { scope: 'PERIOD' as const, from: from.value, to: to.value }))

const { data, status, error, refresh } = await useAsyncData(
  'finance-foregone',
  () => (ready.value
    ? request<{ report: FinanceForegoneReport }>('/api/admin/finance/foregone', { query: query.value }).then(response => response.report)
    : Promise.resolve(null)),
  { watch: [query] },
)

const reportFailure = computed(() => (error.value ? refusalText(error.value, 'The report could not be read.') : null))
</script>

<template>
  <div class="space-y-6">
    <AdminToolbar
      :filterable="false"
      :searchable="false"
    >
      <template #actions>
        <USelect
          v-model="scopeKind"
          data-test="scope-kind"
          :items="['SHOW', 'PERIOD']"
        />
        <USelectMenu
          v-if="scopeKind === 'SHOW'"
          v-model="showId"
          data-test="scope-show"
          :items="showOptions"
          value-key="value"
          placeholder="Choose a show"
        />
        <template v-if="scopeKind === 'PERIOD'">
          <DateField
            v-model="from"
            data-test="scope-from"
          />
          <DateField
            v-model="to"
            data-test="scope-to"
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
        class="space-y-2"
        data-test="section-foregone"
      >
        <h2 class="font-semibold">
          Foregone value
        </h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Given away
              </th><th>Count</th><th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b">
              <td
                class="py-2"
                data-test="foregone-comps-label"
              >
                Comps
              </td>
              <td data-test="foregone-comps-count">
                {{ data.foregone.compCount }}
              </td>
              <td data-test="foregone-comps-pence">
                {{ saysMoney(data.foregone.compsPence) }}
              </td>
            </tr>
            <tr>
              <td class="py-2">
                Discounts
              </td>
              <td data-test="foregone-discounts-count">
                {{ data.foregone.discountCount }}
              </td>
              <td data-test="foregone-discounts-pence">
                {{ saysMoney(data.foregone.discountsPence) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section
        class="space-y-2"
        data-test="section-access"
      >
        <h2 class="font-semibold">
          Access and companion admissions
        </h2>
        <p
          v-if="data.accessAdmissions.length === 0"
          class="text-muted"
        >
          None in this scope.
        </p>
        <table
          v-else
          class="w-full text-sm"
        >
          <thead>
            <tr class="border-b text-left text-muted">
              <th class="py-2">
                Kind
              </th><th>Count</th><th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.accessAdmissions"
              :key="row.accessKind"
              data-test="access-row"
            >
              <td class="py-2">
                {{ saysAccessKind(row.accessKind) }}
              </td>
              <td>{{ row.count }}</td>
              <td>{{ saysMoney(row.valuePence) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <p
      v-else-if="!ready"
      class="text-muted"
      data-test="choose-show"
    >
      Choose a show to see its figures.
    </p>
  </div>
</template>
