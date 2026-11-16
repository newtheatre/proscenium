<!-- Ledger (Box office specification, part 5): sealed postings, newest first, each with its entries.
     Filter by account or period; every posting names where it came from. Older postings load on
     request, fifty at a time. A correction reverses a posting whole, and posts nothing else. -->
<script setup lang="ts">
interface Entry { accountId: string, code: string, name: string, amountMinor: number, currency: string, productionId: string | null, performanceId: string | null }
interface Posting { id: string, kind: string, source: { module: string, type: string, id: string }, reversesId: string | null, periodId: string, occurredAt: number, postedAt: number, entries: Entry[] }
interface Page { postings: Posting[], next: string | null, canCorrect: boolean }

const { t, te } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const router = useRouter()
const { money, day } = await useMoney()
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

// Older pages are kept below the first; a new filter starts again from the newest.
const older = ref<Posting[]>([])
const next = ref<string | null>(null)
watch(data, (value) => {
  older.value = []
  next.value = value?.next ?? null
}, { immediate: true })
const loadingMore = ref(false)
async function more() {
  if (!next.value) return
  loadingMore.value = true
  try {
    const page = await $api<Page>('/api/finance/postings', { query: { ...query.value, before: next.value } })
    older.value.push(...page.postings)
    next.value = page.next
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
  finally {
    loadingMore.value = false
  }
}
const postings = computed(() => [...(data.value?.postings ?? []), ...older.value])

const kindLabel = (kind: string) => t(`finance.screens.ledger.kinds.${kind}`)
const sourceLabel = (p: Posting) => (te(`${p.source.module}.module.name`) ? t(`${p.source.module}.module.name`) : p.source.module)

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
        <USelect
          v-model="accountId"
          :items="accountItems"
          :aria-label="t('finance.screens.ledger.account')"
          class="w-64"
        />
        <USelect
          v-model="periodId"
          :items="periodItems"
          :aria-label="t('finance.screens.ledger.period')"
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
        <UCard
          v-for="p in postings"
          :key="p.id"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ kindLabel(p.kind) }}</span>
              <span class="text-sm text-muted">{{ day(p.occurredAt) }} · {{ sourceLabel(p) }} {{ p.source.id }}</span>
              <StatusBadge
                v-if="p.reversesId"
                tone="neutral"
                :label="t('finance.screens.ledger.reversal')"
              />
              <span class="flex-1" />
              <UButton
                v-if="data?.canCorrect && !p.reversesId"
                :label="t('finance.screens.ledger.reverse-button')"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="reverse(p)"
              />
            </div>
          </template>
          <table class="w-full text-sm">
            <caption class="sr-only">
              {{ t('finance.screens.ledger.entries-of', { kind: kindLabel(p.kind), day: day(p.occurredAt) }) }}
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
            <tbody class="divide-y divide-default">
              <tr
                v-for="(e, i) in p.entries"
                :key="i"
              >
                <td class="px-4 py-1.5">
                  <NuxtLink
                    :to="{ query: { ...route.query, accountId: e.accountId } }"
                    class="hover:underline"
                  >
                    <span class="text-muted">{{ e.code }}</span> {{ e.name }}
                  </NuxtLink>
                </td>
                <td class="w-32 px-4 py-1.5 text-right tabular-nums">
                  {{ e.amountMinor > 0 ? money(e.amountMinor, e.currency) : '' }}
                </td>
                <td class="w-32 px-4 py-1.5 text-right tabular-nums">
                  {{ e.amountMinor < 0 ? money(-e.amountMinor, e.currency) : '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </UCard>
        <UButton
          v-if="next"
          :label="t('finance.screens.ledger.more')"
          color="neutral"
          variant="outline"
          :loading="loadingMore"
          block
          @click="more"
        />
      </div>
    </DataBoundary>
  </PageFrame>
</template>
