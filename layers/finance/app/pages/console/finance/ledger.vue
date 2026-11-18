<!-- Ledger (Box office specification, part 5): sealed postings, newest first, each opening to its
     entries. Filter by account, period, production, kind or date; every posting names where it came
     from. Search finds a posting by an account's code or name, or by its source's reference. A
     correction reverses a posting whole, and posts nothing else. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ledgerList } from '../../../../shared/lists'

interface Entry { accountId: string, code: string, name: string, amountMinor: number, currency: string, productionId: string | null, performanceId: string | null }
interface Row { id: string, kind: string, source: { module: string, type: string, id: string, title?: string, to?: string }, reversesId: string | null, periodId: string, occurredAt: number, postedAt: number, postedByName: string | null, performances: { id: string, title: string, startsAt: number | null }[], entries: Entry[], canReverse: boolean }

const ROUTE = '/api/finance/postings'

const { t, te } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const { money } = await useMoney()
const { day, dateTime } = useDates()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data: accounts } = await useAPI<{ accounts: { id: string, code: string, name: string }[] }>('/api/finance/accounts', { key: 'finance:accounts' })
const { data: periods } = await useAPI<{ periods: { id: string, label: string }[] }>('/api/finance/periods', { key: 'finance:periods' })
const { data: productions } = await useAPI<{ productions: { productionId: string, title: string }[] }>('/api/finance/productions', { key: 'finance:productions' })

const kindLabel = (kind: string) => t(`finance.screens.ledger.kinds.${kind}`)
const sourceLabel = (p: Row) => (te(`${p.source.module}.module.name`) ? t(`${p.source.module}.module.name`) : p.source.module)

const list = computed(() => ({
  ...ledgerList,
  filters: {
    account: { ...ledgerList.filters.account, label: t('finance.screens.ledger.account') },
    period: { ...ledgerList.filters.period, label: t('finance.screens.ledger.period') },
    production: { ...ledgerList.filters.production, label: t('finance.screens.ledger.production') },
    kind: { ...ledgerList.filters.kind, label: t('finance.screens.ledger.posting'), options: ledgerList.filters.kind.options.map(o => ({ value: o.value, label: kindLabel(o.value) })) },
    occurred: { ...ledgerList.filters.occurred, label: t('finance.screens.ledger.date'), presets: ledgerList.filters.occurred.presets.map(p => ({ value: p.value, label: t(`finance.screens.ledger.presets.${p.value}`) })) },
  },
  sorts: { occurred: { ...ledgerList.sorts.occurred, label: t('finance.screens.ledger.date') } },
  columns: Object.fromEntries(Object.entries(ledgerList.columns).map(([key, c]) => [key, { ...c, label: t(`finance.screens.ledger.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(ledgerList.views).map(([key, v]) => [key, { ...v, label: t(`finance.screens.ledger.view.${key}`) }])),
}))
// A production keeps a row for each currency it took; the filter wants it once.
const filterOptions = computed(() => ({
  account: (accounts.value?.accounts ?? []).map(a => ({ value: a.id, label: a.name })),
  period: (periods.value?.periods ?? []).map(p => ({ value: p.id, label: p.label })),
  production: [...new Map((productions.value?.productions ?? []).map(p => [p.productionId, p.title]))].map(([value, label]) => ({ value, label })),
}))

/** What a posting moved: its debits, by currency. */
function amountOf(p: Row): string {
  const totals = new Map<string, number>()
  for (const e of p.entries) if (e.amountMinor > 0) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amountMinor)
  return [...totals].map(([currency, minor]) => money(minor, currency)).join(', ')
}
const rowLabel = (p: Row) => t('finance.screens.ledger.reverse-thing', { kind: kindLabel(p.kind).toLowerCase(), day: day(p.occurredAt) })

async function reverse(p: Row) {
  const ok = await confirm({
    verb: t('finance.screens.ledger.reverse-verb'),
    thing: rowLabel(p),
    consequence: t('finance.screens.ledger.reverse-consequence'),
    button: t('finance.screens.ledger.reverse-button'),
  })
  if (!ok) return
  try {
    await $api(`/api/finance/postings/${p.id}/reverse` as string, { method: 'POST', body: {}, headers: { 'idempotency-key': `reverse:${p.id}` } })
    toast.add({ title: t('finance.screens.ledger.reversed'), color: 'success' })
    await refreshNuxtData(`core:list:${ROUTE}`)
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
const rowActions = (p: Row): DropdownMenuItem[] => (p.canReverse
  ? [{ label: t('finance.screens.ledger.reverse-button'), icon: 'i-lucide-undo-2', onSelect: () => { void reverse(p) } }]
  : [])
</script>

<template>
  <PageList
    :title="t('finance.navigation.ledger.label')"
    :route="ROUTE"
    :list="list"
    :filter-options="filterOptions"
    :row-label="rowLabel"
    :row-actions="rowActions"
    :empty="{ title: t('finance.screens.ledger.empty'), description: t('finance.screens.ledger.empty-help'), icon: 'i-lucide-book-open' }"
  >
    <template #cell-kind="{ row }">
      <span class="font-medium text-highlighted">{{ kindLabel(row.kind) }}</span>
      <StatusBadge
        v-if="row.reversesId"
        tone="neutral"
        :label="t('finance.screens.ledger.reversal')"
        class="ms-2"
      />
    </template>
    <template #cell-occurred="{ row }">
      {{ day(row.occurredAt) }}
    </template>
    <template #cell-source="{ row }">
      <template v-if="row.source.title">
        <ULink
          v-if="row.source.to"
          :to="row.source.to"
          class="font-medium"
        >
          {{ row.source.title }}
        </ULink>
        <span
          v-else
          class="font-medium"
        >{{ row.source.title }}</span>
      </template>
      <span
        v-else
        class="text-muted"
      >{{ sourceLabel(row) }}</span>
      <span
        v-for="p in row.performances"
        :key="p.id"
        class="block text-sm text-muted"
      >{{ p.startsAt ? t('finance.screens.ledger.performance', { title: p.title, when: dateTime(p.startsAt) }) : p.title }}</span>
      <span
        v-if="row.postedByName"
        class="block text-sm text-muted"
      >{{ t('finance.screens.ledger.posted-by', { person: row.postedByName }) }}</span>
    </template>
    <template #cell-amount="{ row }">
      <span class="tabular-nums">{{ amountOf(row) }}</span>
    </template>
    <template #expanded="{ row }">
      <table class="w-full">
        <caption class="sr-only">
          {{ t('finance.screens.ledger.entries-of', { kind: kindLabel(row.kind), day: day(row.occurredAt) }) }}
        </caption>
        <thead class="sr-only">
          <tr>
            <th scope="col">
              {{ t('finance.screens.ledger.account') }}
            </th>
            <th scope="col">
              {{ t('finance.screens.ledger.debit') }}
            </th>
            <th scope="col">
              {{ t('finance.screens.ledger.credit') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(entry, n) in row.entries"
            :key="n"
          >
            <td class="py-1">
              <ULink
                :to="{ query: { ...route.query, account: entry.accountId, page: undefined } }"
                :title="entry.code"
              >
                {{ entry.name }}
              </ULink>
            </td>
            <td class="w-32 py-1 text-right tabular-nums">
              {{ entry.amountMinor > 0 ? money(entry.amountMinor, entry.currency) : '' }}
            </td>
            <td class="w-32 py-1 text-right tabular-nums">
              {{ entry.amountMinor < 0 ? money(-entry.amountMinor, entry.currency) : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </PageList>
</template>
