<!-- Ledger (Box office specification, part 5): sealed postings, newest first, each with its entries.
     Filter by account or period; every posting names where it came from. Older postings load on
     request, fifty at a time. A correction reverses a posting whole, and posts nothing else. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Entry { accountId: string, code: string, name: string, amountMinor: number, currency: string, productionId: string | null, performanceId: string | null }
interface Posting { id: string, kind: string, source: { module: string, type: string, id: string }, reversesId: string | null, periodId: string, occurredAt: number, postedAt: number, entries: Entry[] }
interface Page { postings: Posting[], next: string | null, canCorrect: boolean }

const { t, te } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const router = useRouter()
const { money } = await useMoney()
const { day } = useDates()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()

const ANY = '__any'
const filter = (name: 'accountId' | 'periodId') => computed({
  get: () => (typeof route.query[name] === 'string' ? route.query[name] as string : ANY),
  set: (value: string) => { void router.push({ query: { ...route.query, [name]: value === ANY ? undefined : value } }) },
})
const accountId = filter('accountId')
const periodId = filter('periodId')
// A production's statement links here with its id, to show the postings behind it.
const productionId = computed(() => (typeof route.query.productionId === 'string' ? route.query.productionId : undefined))
const query = computed(() => ({ accountId: accountId.value === ANY ? undefined : accountId.value, periodId: periodId.value === ANY ? undefined : periodId.value, productionId: productionId.value }))

const { data, status, error, refresh } = await useAPI<Page>('/api/finance/postings', { query, key: 'finance:ledger' })
const { data: accounts } = await useAPI<{ accounts: { id: string, code: string, name: string }[] }>('/api/finance/accounts', { key: 'finance:accounts' })
const { data: periods } = await useAPI<{ periods: { id: string, label: string }[] }>('/api/finance/periods', { key: 'finance:periods' })
const accountItems = computed(() => [{ value: ANY, label: t('finance.screens.ledger.any-account') }, ...(accounts.value?.accounts ?? []).map(a => ({ value: a.id, label: `${a.code} · ${a.name}` }))])
const periodItems = computed(() => [{ value: ANY, label: t('finance.screens.ledger.any-period') }, ...(periods.value?.periods ?? []).map(p => ({ value: p.id, label: p.label }))])
// A searchable select is a button showing its choice, so its name must hold the words on it:
// "Account: Any account".
const named = (what: string, items: { value: string, label: string }[], chosen: string) => `${what}: ${items.find(item => item.value === chosen)?.label ?? ''}`

// Older pages are kept below the first; a new filter starts again from the newest.
const older = ref<Posting[]>([])
const next = ref<string | null>(null)
watch(data, (value) => {
  older.value = []
  next.value = value?.next ?? null
}, { immediate: true })
// The button shows its own spinner while this runs (loading-auto).
async function more() {
  if (!next.value) return
  try {
    const page = await $api<Page>('/api/finance/postings', { query: { ...query.value, before: next.value } })
    older.value.push(...page.postings)
    next.value = page.next
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
const postings = computed(() => [...(data.value?.postings ?? []), ...older.value])

const kindLabel = (kind: string) => t(`finance.screens.ledger.kinds.${kind}`)
const sourceLabel = (p: Posting) => (te(`${p.source.module}.module.name`) ? t(`${p.source.module}.module.name`) : p.source.module)

// One row per posting, opening to its entries. Rows start open: a ledger is read entry by entry.
const columns: TableColumn<Posting>[] = [
  { id: 'open', header: () => h('span', { class: 'sr-only' }, t('finance.screens.ledger.entries')), meta: { class: { th: 'w-10', td: 'w-10' } } },
  { id: 'kind', header: t('finance.screens.ledger.posting') },
  { id: 'day', header: t('finance.screens.ledger.date'), accessorFn: p => day(p.occurredAt) },
  { id: 'source', header: t('finance.screens.ledger.source'), accessorFn: p => `${sourceLabel(p)} ${p.source.id}`, meta: { class: { td: 'text-muted' } } },
  { id: 'amount', header: t('finance.screens.ledger.amount'), accessorFn: amountOf, meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, t('finance.screens.ledger.actions')), meta: { class: { td: 'text-right' } } },
]
const entryColumns: TableColumn<Entry>[] = [
  { id: 'account', header: t('finance.screens.ledger.account') },
  { id: 'debit', header: t('finance.screens.ledger.debit'), accessorFn: e => (e.amountMinor > 0 ? money(e.amountMinor, e.currency) : ''), meta: { class: { th: 'w-32 text-right', td: 'w-32 text-right tabular-nums' } } },
  { id: 'credit', header: t('finance.screens.ledger.credit'), accessorFn: e => (e.amountMinor < 0 ? money(-e.amountMinor, e.currency) : ''), meta: { class: { th: 'w-32 text-right', td: 'w-32 text-right tabular-nums' } } },
]
/** What a posting moved: its debits, by currency. */
function amountOf(p: Posting): string {
  const totals = new Map<string, number>()
  for (const e of p.entries) if (e.amountMinor > 0) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amountMinor)
  return [...totals].map(([currency, minor]) => money(minor, currency)).join(', ')
}
const expanded = ref<true | Record<string, boolean>>(true)

async function reverse(p: Posting) {
  const ok = await confirm({
    verb: t('finance.screens.ledger.reverse-verb'),
    thing: t('finance.screens.ledger.reverse-thing', { kind: kindLabel(p.kind).toLowerCase(), day: day(p.occurredAt) }),
    consequence: t('finance.screens.ledger.reverse-consequence'),
    button: t('finance.screens.ledger.reverse-button'),
  })
  if (!ok) return
  try {
    await $api(`/api/finance/postings/${p.id}/reverse` as string, { method: 'POST', body: {}, headers: { 'idempotency-key': `reverse:${p.id}` } })
    toast.add({ title: t('finance.screens.ledger.reversed'), color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('finance.navigation.ledger.label')">
    <template #toolbar>
      <div class="flex flex-wrap gap-2">
        <USelectMenu
          v-model="accountId"
          value-key="value"
          :items="accountItems"
          :aria-label="named(t('finance.screens.ledger.account'), accountItems, accountId)"
          class="w-64"
        />
        <USelectMenu
          v-model="periodId"
          value-key="value"
          :items="periodItems"
          :aria-label="named(t('finance.screens.ledger.period'), periodItems, periodId)"
          class="w-48"
        />
        <UButton
          v-if="productionId"
          :label="t('finance.screens.ledger.one-production')"
          trailing-icon="i-lucide-x"
          color="neutral"
          variant="soft"
          :to="{ query: { ...route.query, productionId: undefined } }"
        />
      </div>
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!postings.length"
        :title="t('finance.screens.ledger.empty')"
        :description="t('finance.screens.ledger.empty-help')"
        icon="i-lucide-book-open"
      />
      <div
        v-else
        class="space-y-3"
      >
        <UTable
          v-model:expanded="expanded"
          :data="postings"
          :columns="columns"
          :get-row-id="(p: Posting) => p.id"
          :caption="t('finance.navigation.ledger.label')"
        >
          <template #open-cell="{ row }">
            <IconButton
              :icon="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              size="xs"
              :aria-expanded="row.getIsExpanded()"
              :label="t('finance.screens.ledger.entries-of', { kind: kindLabel(row.original.kind), day: day(row.original.occurredAt) })"
              @click="row.toggleExpanded()"
            />
          </template>
          <template #kind-cell="{ row }">
            <span class="font-medium text-highlighted">{{ kindLabel(row.original.kind) }}</span>
            <StatusBadge
              v-if="row.original.reversesId"
              tone="neutral"
              :label="t('finance.screens.ledger.reversal')"
              class="ms-2"
            />
          </template>
          <template #actions-cell="{ row }">
            <UButton
              v-if="data?.canCorrect && !row.original.reversesId"
              :label="t('finance.screens.ledger.reverse-button')"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="reverse(row.original)"
            />
          </template>
          <template #expanded="{ row }">
            <UTable
              :data="row.original.entries"
              :columns="entryColumns"
              :caption="t('finance.screens.ledger.entries-of', { kind: kindLabel(row.original.kind), day: day(row.original.occurredAt) })"
              :ui="{ root: 'rounded-none border-0', th: 'sr-only' }"
            >
              <template #account-cell="{ row: entry }">
                <ULink :to="{ query: { ...route.query, accountId: entry.original.accountId } }">
                  <span class="text-muted">{{ entry.original.code }}</span> {{ entry.original.name }}
                </ULink>
              </template>
            </UTable>
          </template>
        </UTable>
        <UButton
          v-if="next"
          :label="t('finance.screens.ledger.more')"
          color="neutral"
          variant="outline"
          loading-auto
          block
          @click="more"
        />
      </div>
    </DataBoundary>
  </PageFrame>
</template>
