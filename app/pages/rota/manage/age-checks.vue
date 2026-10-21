<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { ageCheckVenue, saysIdType, saysOutcome, saysRefusalReason } from '#shared/utils/age-checks'
import { londonDay } from '#shared/utils/membership'
import { saysWhen } from '#shared/utils/when'
import type { AgeCheckOutcome, IdType, RefusalReason } from '#shared/utils/age-checks'
import type { Page } from '#shared/utils/pagination'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Challenge 25 register', middleware: 'console', docs: '/docs/rota/challenge-25-register' })

interface Entry {
  id: string
  createdAt: number
  venueName: string | null
  outcome: AgeCheckOutcome
  idType: IdType | null
  reason: RefusalReason | null
  description: string
  product: string | null
  checkedByName: string
  supersedesId: string | null
  supersededBy: string | null
}

// A London day, never the UTC one: after 23:00 in summer the two disagree (0014).
const today = londonDay(new Date())
const from = ref(today)
const to = ref(today)
const page = ref(1)

// The export carries the filter rather than the page, so what is saved is what was asked for.
function exportUrl(format: 'csv' | 'pdf'): string {
  const query = new URLSearchParams({ from: from.value, to: to.value, format })
  return `/api/admin/age-checks/export?${query.toString()}`
}

const refusal = computed(() => (from.value && to.value && from.value <= to.value ? null : 'Pick a range that starts before it ends'))

watch([from, to], () => {
  page.value = 1
})

// What the export would carry, on screen first, so nobody downloads a file to find out (0136).
const { data, status, error, refresh } = await useFetch<Page<Entry>>('/api/admin/age-checks', {
  query: computed(() => ({ from: from.value, to: to.value, page: page.value })),
  immediate: refusal.value === null,
  watch: false,
  default: (): Page<Entry> => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 }),
})
watch([from, to, page], () => {
  if (refusal.value === null) void refresh()
})

const readFailure = useListFailure(error, 'The register could not be read.')

const UBadge = resolveComponent('UBadge')

const OUTCOME_COLOR: Record<AgeCheckOutcome, 'success' | 'error' | 'neutral'> = {
  ACCEPTED: 'success',
  REFUSED: 'error',
  NOT_REQUIRED: 'neutral',
}

function detail(entry: Entry): string {
  if (entry.idType) return saysIdType(entry.idType)
  if (entry.reason) return saysRefusalReason(entry.reason)
  return ''
}

const columns: TableColumn<Entry>[] = [
  {
    id: 'when',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, saysWhen(row.original.createdAt)),
      h('div', { class: 'text-xs text-muted' }, ageCheckVenue(row.original.venueName)),
    ]),
  },
  {
    id: 'outcome',
    header: 'Outcome',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h(UBadge, { color: OUTCOME_COLOR[row.original.outcome], variant: 'subtle', size: 'sm' }, () => saysOutcome(row.original.outcome)),
      detail(row.original) ? h('div', { class: 'text-xs text-muted' }, detail(row.original)) : null,
      row.original.supersededBy ? h('div', { class: 'text-xs text-warning' }, 'Corrected by a later entry') : null,
      row.original.supersedesId ? h('div', { class: 'text-xs text-muted' }, 'Corrects an earlier entry') : null,
    ]),
  },
  {
    id: 'description',
    header: 'Description',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.description),
      row.original.product ? h('div', { class: 'text-xs text-muted' }, row.original.product) : null,
    ]),
  },
  { id: 'by', header: 'Checked by', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-sm text-muted` } }, cell: ({ row }) => row.original.checkedByName },
]
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-muted">
      Every Challenge 25 check in a date range, corrections included, to read here or hand to an inspector.
    </p>

    <UCard data-test="export-panel">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField label="From">
          <DateField
            v-model="from"
            data-test="export-from"
          />
        </UFormField>

        <UFormField label="To">
          <DateField
            v-model="to"
            data-test="export-to"
          />
        </UFormField>

        <UButton
          data-test="export-csv"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :disabled="refusal !== null"
          :to="refusal ? undefined : exportUrl('csv')"
          external
        >
          Export CSV
        </UButton>

        <UButton
          data-test="export-pdf"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :disabled="refusal !== null"
          :to="refusal ? undefined : exportUrl('pdf')"
          external
        >
          Export PDF
        </UButton>
      </div>

      <UAlert
        v-if="refusal"
        class="mt-4"
        color="warning"
        variant="subtle"
        data-test="export-refusal"
        :description="refusal"
      />
    </UCard>

    <ReadFailure
      v-if="readFailure"
      :failure="readFailure"
      @retry="refresh()"
    />

    <template v-else-if="refusal === null">
      <UTable
        :data="data.items"
        :columns="columns"
        :loading="status === 'pending'"
        data-test="register-table"
      >
        <template #empty>
          <p
            class="py-6 text-center text-sm text-muted"
            data-test="register-empty"
          >
            No check was recorded in these days.
          </p>
        </template>
      </UTable>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          {{ plural(data.total, 'check') }}, newest first.
        </p>
        <UPagination
          v-if="data.pages > 1"
          v-model:page="page"
          :total="data.total"
          :items-per-page="data.pageSize"
        />
      </div>
    </template>
  </div>
</template>
