<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysMoney } from '#shared/utils/bar'
import { describeKind, saysEntrySource, saysTender } from '#shared/utils/ledger'
import { saysWhen, saysWhenLong } from '#shared/utils/when'
import { ledgerEntriesList, saysEntryWhat, saysNoEntries } from '#shared/utils/ledger-entries-list'
import type { TableColumn } from '@nuxt/ui'
import type { LedgerEntryLine, LedgerEntryOpened, LedgerEntryRow } from '#shared/utils/ledger-entries-list'
import type { Page } from '#shared/utils/pagination'

definePageMeta({ layout: 'console', title: 'Ledger entries', middleware: 'console', docs: '/docs/money/ledger-entries' })

const route = useRoute()
const request = useRequestFetch()
const UButton = resolveComponent('UButton')

// Opened cold (no query string at all), the list defaults to today's London day rather than
// asking the endpoint for every entry the ledger has ever held (I-105 criterion 3).
const today = londonDay(new Date())
if (typeof route.query.happenedAt !== 'string') {
  await navigateTo({ path: route.path, query: { ...route.query, happenedAt: today } }, { replace: true })
}

const { search, conditions, sort, page, query, active, set, setSort, clear } = useListQuery(ledgerEntriesList)

const empty = (): Page<LedgerEntryRow> => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 })

const { data, status: loading, error } = await useAsyncData(
  'ledger-entries',
  () => request<Page<LedgerEntryRow>>('/api/admin/finance/season/entries', { query: query.value }),
  { watch: [query], default: empty },
)

const entriesFailure = computed(() => (error.value ? refusalText(error.value, 'The entries could not be read.') : null))

// One entry, opened in a drawer: who took it, who approved it, whose tab and every line (issue 1361).
const opened = ref<LedgerEntryOpened | null>(null)
const openFailure = ref<string | null>(null)
const opening = ref<string | null>(null)
const drawerOpen = computed({
  get: () => opened.value !== null || openFailure.value !== null,
  set: (open) => {
    if (open) return
    opened.value = null
    openFailure.value = null
  },
})

async function open(entry: LedgerEntryRow): Promise<void> {
  opening.value = entry.id
  openFailure.value = null
  try {
    opened.value = await request<LedgerEntryOpened>(`/api/admin/finance/season/entries/${entry.id}`)
  }
  catch (openError) {
    openFailure.value = refusalText(openError, 'That entry could not be read.')
  }
  finally {
    opening.value = null
  }
}

// What the drawer says about the entry, one fact to a line, and only the facts it carries.
const facts = computed(() => {
  const entry = opened.value
  if (!entry) return []
  return [
    { label: 'When', says: saysWhenLong(entry.happenedAt) },
    { label: 'Where and how', says: `${saysEntrySource(entry.source)}, ${saysTender(entry.tender)}` },
    { label: 'Amount', says: saysMoney(entry.totalPence) },
    { label: 'Taken by', says: entry.takenBy },
    { label: 'Comp reason', says: entry.compReason },
    { label: 'Comp approved by', says: entry.compApprovedBy },
    { label: 'On the tab of', says: entry.tabDebtor },
    { label: 'Why it was voided', says: entry.voidReason },
  ].filter((fact): fact is { label: string, says: string } => Boolean(fact.says))
})

const columns: TableColumn<LedgerEntryRow>[] = [
  {
    id: 'happenedAt',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, saysWhen(row.original.happenedAt)),
      // Below sm the source and the tender are hidden: shown here instead, so a phone keeps the
      // amount in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, `${saysEntrySource(row.original.source)}, ${saysTender(row.original.tender)}`),
    ]),
  },
  {
    id: 'what',
    header: 'What',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, saysEntryWhat(row.original)),
      row.original.reference ? h('div', { class: 'text-xs text-muted font-mono' }, row.original.reference) : null,
    ]),
  },
  {
    id: 'source',
    header: 'Source',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    cell: ({ row }) => h('span', {}, saysEntrySource(row.original.source)),
  },
  {
    id: 'tender',
    header: 'Tender',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    cell: ({ row }) => h('span', {}, saysTender(row.original.tender)),
  },
  {
    id: 'totalPence',
    header: 'Amount',
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => h('span', {}, saysMoney(row.original.totalPence)),
  },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: ACTIONS_COLUMN,
    cell: ({ row }) => h(UButton, {
      'size': 'sm',
      'variant': 'subtle',
      'loading': opening.value === row.original.id,
      'aria-label': `Open the entry of ${saysWhen(row.original.happenedAt)}, ${saysMoney(row.original.totalPence)}`,
      'data-test': `open-entry-${row.original.id}`,
      'onClick': () => open(row.original),
    }, () => 'Open'),
  },
]

// Two columns: the panel is narrow at every width, so what a line was carries its show, its
// booking and its discount beneath it rather than beside it.
const lineColumns: TableColumn<LedgerEntryLine>[] = [
  {
    id: 'kind',
    header: 'Line',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.qty > 1 ? `${describeKind(row.original.kind)} × ${row.original.qty}` : describeKind(row.original.kind)),
      ...[
        [row.original.showTitle, row.original.startsAt ? saysWhen(row.original.startsAt) : null].filter(Boolean).join(', '),
        row.original.reference ? `Booking ${row.original.reference}` : '',
        row.original.discountPence ? `${saysMoney(row.original.discountPence)} off${row.original.discountPercent ? ` (${row.original.discountPercent}%)` : ''}` : '',
      ].filter(Boolean).map(detail => h('div', { class: 'text-xs text-muted' }, detail)),
    ]),
  },
  {
    id: 'amount',
    header: 'Amount',
    meta: RIGHT_ALIGNED,
    cell: ({ row }) => saysMoney(row.original.amountPence),
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
      v-model:search="search"
      :placeholder="ledgerEntriesList.search.placeholder"
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
          {{ saysNoEntries(conditions, active.some(chip => chip.key === 'search')) }}
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

    <USlideover
      v-model:open="drawerOpen"
      :title="opened ? `The entry of ${saysWhen(opened.happenedAt)}` : 'The entry'"
      description="Everything the ledger holds about it. Entries are never edited: a correction is an entry of its own."
    >
      <template #body>
        <UAlert
          v-if="openFailure"
          data-test="entry-failure"
          color="error"
          variant="subtle"
          :description="openFailure"
        />
        <div
          v-else-if="opened"
          class="space-y-6"
          data-test="entry-detail"
        >
          <dl class="divide-y divide-default text-sm">
            <div
              v-for="fact in facts"
              :key="fact.label"
              class="flex items-baseline justify-between gap-3 py-2"
            >
              <dt class="text-muted">
                {{ fact.label }}
              </dt>
              <dd class="text-right">
                {{ fact.says }}
              </dd>
            </div>
          </dl>
          <p
            v-if="opened.voidOfEntryId || opened.reversesEntryId"
            class="text-sm text-muted"
          >
            {{ opened.voidOfEntryId ? 'This entry voids an earlier charge.' : 'This entry reverses an earlier one, carried from the old system.' }}
          </p>
          <UTable
            :data="opened.lines"
            :columns="lineColumns"
            data-test="entry-lines"
          >
            <template #empty>
              <p class="py-6 text-center text-sm text-muted">
                This entry has no lines.
              </p>
            </template>
          </UTable>
        </div>
      </template>
    </USlideover>
  </div>
</template>
