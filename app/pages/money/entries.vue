<script setup lang="ts">
import { h } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { saysEntrySource, saysTender } from '#shared/utils/ledger'
import { formatLondon } from '#shared/utils/london'
import { ledgerEntriesList } from '#shared/utils/ledger-entries-list'
import type { TableColumn } from '@nuxt/ui'
import type { EntrySource, Tender } from '#shared/utils/ledger'
import type { Page } from '#shared/utils/pagination'

definePageMeta({ layout: 'console', title: 'Ledger entries', middleware: 'console' })

interface LedgerEntry { id: string, happenedAt: number, source: EntrySource, tender: Tender, totalPence: number }

const route = useRoute()
const request = useRequestFetch()

// Opened cold (no query string at all), the list defaults to today's London day rather than
// asking the endpoint for every entry the ledger has ever held (I-105 criterion 3).
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
if (typeof route.query.happenedAt !== 'string') {
  await navigateTo({ path: route.path, query: { ...route.query, happenedAt: today } }, { replace: true })
}

const { conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(ledgerEntriesList)

const empty = (): Page<LedgerEntry> => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 })

const { data, status: loading, error } = await useAsyncData(
  'ledger-entries',
  () => request<Page<LedgerEntry>>('/api/admin/finance/season/entries', { query: query.value }),
  { watch: [query], default: empty },
)

const entriesFailure = computed(() => (error.value ? refusalText(error.value, 'The entries could not be read.') : null))

const columns: TableColumn<LedgerEntry>[] = [
  {
    id: 'happenedAt',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', {}, formatLondon(new Date(row.original.happenedAt * 1000), { dateStyle: 'short', timeStyle: 'short' })),
  },
  {
    id: 'source',
    header: 'Source',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', {}, saysEntrySource(row.original.source)),
  },
  {
    id: 'tender',
    header: 'Tender',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('span', {}, saysTender(row.original.tender)),
  },
  {
    id: 'totalPence',
    header: 'Amount',
    meta: { class: { td: 'whitespace-nowrap text-right' } },
    cell: ({ row }) => h('span', {}, saysMoney(row.original.totalPence)),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="entriesFailure"
      data-test="entries-failure"
      color="error"
      variant="subtle"
      :description="entriesFailure"
    />

    <AdminToolbar
      :active="active"
      :loading="loading === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="ledgerEntriesList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="loading === 'pending'"
      data-test="entries-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'No entry matches that.' : 'Nothing posted to the ledger on this day.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="entries-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'entry', 'entries') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>
  </div>
</template>
