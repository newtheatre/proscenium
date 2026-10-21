<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysAccessKind } from '#shared/utils/ticket-types'
import { FINANCE_SCOPES, saysFinanceScope } from '#shared/utils/finance-reports'
import { h } from 'vue'
import type { AccessAdmissionRow, FinanceForegoneReport } from '#shared/utils/finance-reports'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Comps and discounts', middleware: 'console', docs: '/docs/money/comps-and-discounts' })

interface ShowOption { id: string, title: string, status: string }

const route = useRoute()
const request = useRequestFetch()

// The money dashboard's own period controls, opening on the year (0087); the scope and the show
// sit in the URL beside the period, so a reload or a shared link asks the same question.
const periodForm = await useFinancePeriodForm('foregone-period-choices')
const scopeKind = computed<'SHOW' | 'PERIOD'>({
  get: () => (route.query.scope === 'SHOW' ? 'SHOW' : 'PERIOD'),
  set: value => void navigateTo({ query: { ...route.query, scope: value === 'SHOW' ? value : undefined } }, { replace: true }),
})
const showId = computed<string | undefined>({
  get: () => (typeof route.query.showId === 'string' && route.query.showId ? route.query.showId : undefined),
  set: value => void navigateTo({ query: { ...route.query, showId: value || undefined } }, { replace: true }),
})

const { data: shows } = await useAsyncData('finance-shows', () => request<ShowOption[]>('/api/admin/finance/shows'), { default: () => [] })
const showOptions = computed(() => shows.value.map(one => ({ label: one.title, value: one.id })))

// A show scope has nothing to fetch until one is chosen; a period scope always has a range.
const ready = computed(() => scopeKind.value === 'PERIOD' || Boolean(showId.value))

const query = computed<Record<string, string>>(() => (scopeKind.value === 'SHOW'
  ? { scope: 'SHOW', showId: showId.value ?? '' }
  : periodForm.query.value))

const { data, status, error, refresh } = await useAsyncData(
  'finance-foregone',
  () => (ready.value
    ? request<{ report: FinanceForegoneReport }>('/api/admin/finance/foregone', { query: query.value }).then(response => response.report)
    : Promise.resolve(null)),
  { watch: [query] },
)

const reportFailure = useListFailure(error, 'The report could not be read.')

interface ForegoneRow { label: string, test: string, count: number, pence: number }

const foregoneRows = computed<ForegoneRow[]>(() => (data.value
  ? [
      { label: 'Comps', test: 'comps', count: data.value.foregone.compCount, pence: data.value.foregone.compsPence },
      { label: 'Discounts', test: 'discounts', count: data.value.foregone.discountCount, pence: data.value.foregone.discountsPence },
    ]
  : []))

const foregoneColumns: TableColumn<ForegoneRow>[] = [
  { id: 'label', header: 'Given away', cell: ({ row }) => h('span', { 'data-test': `foregone-${row.original.test}-label` }, row.original.label) },
  {
    id: 'count',
    header: 'Count',
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => h('span', { 'data-test': `foregone-${row.original.test}-count` }, String(row.original.count)),
  },
  {
    id: 'value',
    header: 'Value',
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => h('span', { 'data-test': `foregone-${row.original.test}-pence` }, saysMoney(row.original.pence)),
  },
]

const accessColumns: TableColumn<AccessAdmissionRow>[] = [
  { id: 'kind', header: 'Kind', cell: ({ row }) => saysAccessKind(row.original.accessKind) },
  { id: 'count', header: 'Count', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.count) },
  { id: 'value', header: 'Value', meta: RIGHT_ALIGNED, cell: ({ row }) => saysMoney(row.original.valuePence) },
]
</script>

<template>
  <ReadGate
    :failure="reportFailure"
    class="space-y-6"
    @retry="refresh"
  >
    <AdminToolbar
      :filterable="false"
      :searchable="false"
    >
      <template #actions>
        <USelect
          v-model="scopeKind"
          aria-label="Scope"
          data-test="scope-kind"
          :items="FINANCE_SCOPES.map(value => ({ label: saysFinanceScope(value), value }))"
          value-key="value"
        />
        <USelectMenu
          v-if="scopeKind === 'SHOW'"
          v-model="showId"
          aria-label="Show"
          data-test="scope-show"
          :items="showOptions"
          value-key="value"
          placeholder="Choose a show"
        />
        <PeriodFields
          v-if="scopeKind === 'PERIOD'"
          :form="periodForm"
        />
      </template>
    </AdminToolbar>

    <template v-if="status !== 'pending' && data">
      <section
        class="space-y-2"
        data-test="section-foregone"
      >
        <h2 class="font-semibold">
          Forgone value
        </h2>
        <UTable
          :data="foregoneRows"
          :columns="foregoneColumns"
          data-test="foregone-table"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              Nothing was given away in this scope.
            </p>
          </template>
        </UTable>
      </section>

      <section
        class="space-y-2"
        data-test="section-access"
      >
        <h2 class="font-semibold">
          Access and companion admissions
        </h2>
        <UTable
          :data="data.accessAdmissions"
          :columns="accessColumns"
          data-test="access-admissions-table"
        >
          <template #empty>
            <p class="py-6 text-center text-sm text-muted">
              None in this scope.
            </p>
          </template>
        </UTable>
      </section>
    </template>

    <p
      v-else-if="!ready"
      class="text-muted"
      data-test="choose-show"
    >
      Choose a show to see its figures.
    </p>
  </ReadGate>
</template>
