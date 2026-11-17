<!-- One production's statement (FIN-04): income, refunds and anything else tagged with it, by
     account, for a visiting company's settlement. Readable by someone granted the ledger on this
     production only. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Line { accountId: string, code: string, name: string, kind: string, currency: string, salesMinor: number, refundsMinor: number, otherMinor: number, netMinor: number }

const { t } = useT()
const route = useRoute()
const { money } = await useMoney()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ production: { id: string, title: string, companyName: string | null }, lines: Line[] }>(() => `/api/finance/productions/${id.value}`, { key: `finance:statement:${id.value}` })

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
const amount = (key: 'salesMinor' | 'refundsMinor' | 'otherMinor' | 'netMinor', header: string): TableColumn<Line> => ({
  id: key,
  header,
  accessorFn: l => money(l[key], l.currency),
  footer: () => totals.value.map(total => money(total[key], total.currency)).join(' · '),
  meta: right,
})
const columns = computed<TableColumn<Line>[]>(() => [
  { id: 'account', header: t('finance.screens.ledger.account'), footer: () => t('finance.screens.statement.total') },
  amount('salesMinor', t('finance.screens.statement.sales')),
  amount('refundsMinor', t('finance.screens.statement.refunds')),
  amount('otherMinor', t('finance.screens.statement.other')),
  amount('netMinor', t('finance.screens.statement.net')),
])
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
        :to="{ path: '/console/finance/ledger', query: { productionId: data.production.id } }"
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
          <UTable
            :data="loaded.lines"
            :columns="columns"
            :caption="t('finance.screens.statement.title', { production: loaded.production.title })"
          >
            <template #account-cell="{ row }">
              <span class="text-muted">{{ row.original.code }}</span> {{ row.original.name }}
            </template>
          </UTable>
          <p class="text-sm text-muted">
            {{ t('finance.screens.statement.how') }}
          </p>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
