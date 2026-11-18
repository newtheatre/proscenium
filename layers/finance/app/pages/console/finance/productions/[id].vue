<!-- One production's statement (FIN-04): income, refunds and anything else tagged with it, by
     account and then by performance, for a visiting company's settlement. Readable by someone granted
     the ledger on this production only. Tickets by type and complimentary tickets are Box office's
     sales report, linked from here when Box office is on. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Line { accountId: string, code: string, name: string, kind: string, currency: string, salesMinor: number, refundsMinor: number, otherMinor: number, netMinor: number }
interface PerformanceLine { performanceId: string, label: string | null, startsAt: number | null, currency: string, salesMinor: number, refundsMinor: number, otherMinor: number, netMinor: number }

const { t } = useT()
const route = useRoute()
const { money } = await useMoney()
const { dateTime } = useDates()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ production: { id: string, title: string, companyName: string | null }, lines: Line[], performances: PerformanceLine[], ticketReport: boolean }>(() => `/api/finance/productions/${id.value}`, { key: `finance:statement:${id.value}` })

// One total per currency; a theatre almost always has one.
const totals = computed(() => {
  const out = new Map<string, Omit<Line, 'accountId' | 'code' | 'name' | 'kind'>>()
  for (const l of data.value?.lines ?? []) {
    const total = out.get(l.currency) ?? { currency: l.currency, salesMinor: 0, refundsMinor: 0, otherMinor: 0, netMinor: 0 }
    total.salesMinor += l.salesMinor
    total.refundsMinor += l.refundsMinor
    total.otherMinor += l.otherMinor
    total.netMinor += l.netMinor
    out.set(l.currency, total)
  }
  return [...out.values()]
})

// The totals sit in the table's foot, one line per currency.
const right = { class: { th: 'text-right', td: 'text-right tabular-nums' } }
type Key = 'salesMinor' | 'refundsMinor' | 'otherMinor' | 'netMinor'
const amount = <R extends Record<Key, number> & { currency: string }>(key: Key, header: string, footer = true): TableColumn<R> => ({
  id: key,
  header,
  accessorFn: l => money(l[key], l.currency),
  ...(footer ? { footer: () => totals.value.map(total => money(total[key], total.currency)).join(' · ') } : {}),
  meta: right,
})
const amounts = <R extends Record<Key, number> & { currency: string }>(footer: boolean): TableColumn<R>[] => [
  amount<R>('salesMinor', t('finance.screens.statement.sales'), footer),
  amount<R>('refundsMinor', t('finance.screens.statement.refunds'), footer),
  amount<R>('otherMinor', t('finance.screens.statement.other'), footer),
  amount<R>('netMinor', t('finance.screens.statement.net'), footer),
]
const columns = computed<TableColumn<Line>[]>(() => [
  { id: 'account', header: t('finance.screens.ledger.account'), footer: () => t('finance.screens.statement.total') },
  ...amounts<Line>(true),
])
const performanceColumns = computed<TableColumn<PerformanceLine>[]>(() => [
  { id: 'performance', header: t('finance.screens.statement.performance') },
  ...amounts<PerformanceLine>(false),
])
const performanceName = (p: PerformanceLine) => {
  const when = p.startsAt ? dateTime(p.startsAt) : t('finance.screens.statement.performance-gone')
  return p.label ? `${when}, ${p.label}` : when
}
</script>

<template>
  <PageFrame
    :title="data ? t('finance.screens.statement.title', { production: data.production.title }) : t('finance.navigation.productions.label')"
    :description="data?.production.companyName ?? undefined"
  >
    <template
      v-if="data"
      #primary
    >
      <UButton
        v-if="data.ticketReport"
        :to="{ path: '/console/box-office/reports/sales', query: { productionId: data.production.id } }"
        :label="t('finance.screens.statement.tickets')"
        icon="i-lucide-ticket"
        color="neutral"
        variant="outline"
      />
      <UButton
        :to="{ path: '/console/finance/ledger', query: { production: data.production.id } }"
        :label="t('finance.screens.statement.postings')"
        icon="i-lucide-book-open"
        color="neutral"
        variant="outline"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <EmptyState
          v-if="!loaded.lines.length"
          :title="t('finance.screens.statement.empty')"
          :description="t('finance.screens.statement.empty-help')"
          icon="i-lucide-receipt"
        />
        <div
          v-else
          class="space-y-4"
        >
          <h2 class="text-sm font-semibold text-muted">
            {{ t('finance.screens.statement.by-account') }}
          </h2>
          <UTable
            :data="loaded.lines"
            :columns="columns"
            :caption="t('finance.screens.statement.by-account')"
          >
            <template #account-cell="{ row }">
              <span :title="row.original.code">{{ row.original.name }}</span>
            </template>
          </UTable>
          <template v-if="loaded.performances.length">
            <h2 class="pt-4 text-sm font-semibold text-muted">
              {{ t('finance.screens.statement.by-performance') }}
            </h2>
            <UTable
              :data="loaded.performances"
              :columns="performanceColumns"
              :caption="t('finance.screens.statement.by-performance')"
            >
              <template #performance-cell="{ row }">
                {{ performanceName(row.original) }}
              </template>
            </UTable>
          </template>
          <p class="text-sm text-muted">
            {{ t('finance.screens.statement.how') }}
          </p>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
