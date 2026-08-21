<!--
Admin: bar reports. The Treasurer's two questions are sales by month by tender
and closing stock at cost, so those are the two that open first.
-->
<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Bar reports',
})

interface SalesRow { label: string, qty: number, grossPence: number, cardPence: number, cashPence: number, compPence: number }
interface Term { from: string, to: string, name: string }

const requestFetch = useRequestFetch()
const { data: term } = await useAsyncData('bar-term', () => requestFetch<Term>('/api/admin/bar/reports/term'))

const from = ref(term.value?.from ?? '')
const to = ref(term.value?.to ?? '')
const groupBy = ref<'product' | 'category' | 'performance' | 'month'>('month')

const { data: sales } = await useAsyncData(
  'bar-sales',
  () => requestFetch<Paginated<SalesRow>>('/api/admin/bar/reports/sales', {
    query: { from: from.value, to: to.value, groupBy: groupBy.value, limit: 100 },
  }),
  { watch: [from, to, groupBy] },
)

const { data: gp } = await useAsyncData('bar-gp', () =>
  requestFetch<{ rows: Array<{ name: string, pricePence: number | null, costPence: number | null, marginPence: number | null, gpPercent: number | null }> }>('/api/admin/bar/reports/gp'))

const { data: comps } = await useAsyncData(
  'bar-comps',
  () => requestFetch<{ byReason: Array<{ reason: string, count: number, pence: number }> }>('/api/admin/bar/reports/comps', {
    query: { from: from.value, to: to.value },
  }),
  { watch: [from, to] },
)

const { data: discounts } = await useAsyncData(
  'bar-discounts',
  () => requestFetch<{ byType: Array<{ label: string, uses: number, pence: number }>, byStaff: Array<{ label: string, uses: number, pence: number }> }>('/api/admin/bar/reports/discounts', {
    query: { from: from.value, to: to.value },
  }),
  { watch: [from, to] },
)

const salesRows = computed(() => sales.value?.rows ?? [])
const gpRows = computed(() => gp.value?.rows ?? [])

const salesColumns = [
  { accessorKey: 'label', header: 'Grouping' },
  { accessorKey: 'qty', header: 'Qty' },
  { accessorKey: 'grossPence', header: 'Gross' },
  { accessorKey: 'cardPence', header: 'Card' },
  { accessorKey: 'cashPence', header: 'Cash' },
  { accessorKey: 'compPence', header: 'Comped' },
]

const gpColumns = [
  { accessorKey: 'name', header: 'Product' },
  { accessorKey: 'pricePence', header: 'Price' },
  { accessorKey: 'costPence', header: 'Cost' },
  { accessorKey: 'marginPence', header: 'Margin' },
  { accessorKey: 'gpPercent', header: 'GP %' },
]

/** Exports go through the same endpoints, so a CSV cannot drift from a screen. */
function exportUrl(report: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ from: from.value, to: to.value, format: 'csv', ...extra })
  return `/api/admin/bar/reports/${report}?${params}`
}

const registerUrl = computed(() =>
  `/api/admin/bar/reports/age-checks.pdf?from=${from.value}&to=${to.value}`)
</script>

<template>
  <UContainer class="py-6 space-y-6">
    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="From">
        <UInput
          v-model="from"
          type="date"
        />
      </UFormField>
      <UFormField label="To">
        <UInput
          v-model="to"
          type="date"
        />
      </UFormField>
      <UBadge
        v-if="term"
        variant="subtle"
        color="neutral"
        class="mb-2"
      >
        {{ term.name }}
      </UBadge>
      <div class="ml-auto flex gap-2">
        <UButton
          :to="registerUrl"
          external
          icon="i-lucide-file-text"
          variant="subtle"
          label="Challenge 25 register (PDF)"
        />
      </div>
    </div>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-semibold">
            Sales
          </h3>
          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="groupBy"
              :items="[
                { label: 'By month', value: 'month' },
                { label: 'By product', value: 'product' },
                { label: 'By category', value: 'category' },
                { label: 'By performance', value: 'performance' },
              ]"
              value-key="value"
              class="w-44"
            />
            <UButton
              :to="exportUrl('sales', { groupBy })"
              external
              icon="i-lucide-download"
              variant="ghost"
              size="sm"
              label="CSV"
            />
          </div>
        </div>
      </template>

      <UTable
        :data="salesRows"
        :columns="salesColumns"
      >
        <template #grossPence-cell="{ row }">
          <span class="tabular-nums">{{ formatMoney(row.original.grossPence) }}</span>
        </template>
        <template #cardPence-cell="{ row }">
          <span class="tabular-nums">{{ formatMoney(row.original.cardPence) }}</span>
        </template>
        <template #cashPence-cell="{ row }">
          <span class="tabular-nums">{{ formatMoney(row.original.cashPence) }}</span>
        </template>
        <template #compPence-cell="{ row }">
          <span class="tabular-nums text-muted">{{ formatMoney(row.original.compPence) }}</span>
        </template>
      </UTable>
    </UCard>

    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">
              Comps by reason
            </h3>
            <UButton
              :to="exportUrl('comps')"
              external
              icon="i-lucide-download"
              variant="ghost"
              size="sm"
              label="CSV"
            />
          </div>
        </template>
        <ul class="space-y-1 text-sm">
          <li
            v-for="row in comps?.byReason ?? []"
            :key="row.reason"
            class="flex justify-between"
          >
            <span>{{ row.reason }}</span>
            <span class="tabular-nums">{{ row.count }} &middot; {{ formatMoney(row.pence) }}</span>
          </li>
          <li
            v-if="!comps?.byReason?.length"
            class="text-muted"
          >
            No comps in this range.
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">
              Discounts
            </h3>
            <UButton
              :to="exportUrl('discounts')"
              external
              icon="i-lucide-download"
              variant="ghost"
              size="sm"
              label="CSV"
            />
          </div>
        </template>
        <p class="text-xs uppercase tracking-wide text-muted">
          By type
        </p>
        <ul class="mb-3 space-y-1 text-sm">
          <li
            v-for="row in discounts?.byType ?? []"
            :key="row.label"
            class="flex justify-between"
          >
            <span>{{ row.label }}</span>
            <span class="tabular-nums">{{ row.uses }} &middot; {{ formatMoney(row.pence) }}</span>
          </li>
          <li
            v-if="!discounts?.byType?.length"
            class="text-muted"
          >
            None in this range.
          </li>
        </ul>
        <p class="text-xs uppercase tracking-wide text-muted">
          By staff member
        </p>
        <ul class="space-y-1 text-sm">
          <li
            v-for="row in discounts?.byStaff ?? []"
            :key="row.label"
            class="flex justify-between"
          >
            <span>{{ row.label }}</span>
            <span class="tabular-nums">{{ row.uses }} &middot; {{ formatMoney(row.pence) }}</span>
          </li>
        </ul>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">
            Gross profit
          </h3>
          <UButton
            to="/api/admin/bar/reports/gp?format=csv"
            external
            icon="i-lucide-download"
            variant="ghost"
            size="sm"
            label="CSV"
          />
        </div>
      </template>
      <UTable
        :data="gpRows"
        :columns="gpColumns"
      >
        <template #pricePence-cell="{ row }">
          <span class="tabular-nums">{{ row.original.pricePence == null ? '—' : formatMoney(row.original.pricePence) }}</span>
        </template>
        <template #costPence-cell="{ row }">
          <span class="tabular-nums">{{ row.original.costPence == null ? '—' : formatMoney(row.original.costPence) }}</span>
        </template>
        <template #marginPence-cell="{ row }">
          <span class="tabular-nums">{{ row.original.marginPence == null ? '—' : formatMoney(row.original.marginPence) }}</span>
        </template>
        <template #gpPercent-cell="{ row }">
          <span class="tabular-nums">{{ row.original.gpPercent == null ? '—' : `${row.original.gpPercent}%` }}</span>
        </template>
      </UTable>
      <template #footer>
        <p class="text-xs text-muted">
          Cost is the most recent delivery cost, scaled by what a sale depletes: a 175&nbsp;ml glass
          costs 233 thousandths of its bottle. A product with no delivery recorded has no cost.
        </p>
      </template>
    </UCard>
  </UContainer>
</template>
