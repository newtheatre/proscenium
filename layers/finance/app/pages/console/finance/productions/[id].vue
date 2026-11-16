<!-- One production's statement (FIN-04): income, refunds and anything else tagged with it, by
     account, for a visiting company's settlement. Readable by someone granted the ledger on this
     production only. -->
<script setup lang="ts">
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
          <div class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-sm">
              <caption class="sr-only">
                {{ t('finance.screens.statement.title', { production: loaded.production.title }) }}
              </caption>
              <thead class="bg-elevated/50 text-left">
                <tr>
                  <th
                    scope="col"
                    class="px-3 py-2 font-medium"
                  >
                    {{ t('finance.screens.ledger.account') }}
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-right font-medium"
                  >
                    {{ t('finance.screens.statement.sales') }}
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-right font-medium"
                  >
                    {{ t('finance.screens.statement.refunds') }}
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-right font-medium"
                  >
                    {{ t('finance.screens.statement.other') }}
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-right font-medium"
                  >
                    {{ t('finance.screens.statement.net') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="l in loaded.lines"
                  :key="`${l.accountId}:${l.currency}`"
                >
                  <th
                    scope="row"
                    class="px-3 py-2 text-left font-normal"
                  >
                    <span class="text-muted">{{ l.code }}</span> {{ l.name }}
                  </th>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ money(l.salesMinor, l.currency) }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ money(l.refundsMinor, l.currency) }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ money(l.otherMinor, l.currency) }}
                  </td>
                  <td class="px-3 py-2 text-right font-medium tabular-nums">
                    {{ money(l.netMinor, l.currency) }}
                  </td>
                </tr>
              </tbody>
              <tfoot class="border-t border-default">
                <tr
                  v-for="total in totals"
                  :key="total.currency"
                >
                  <th
                    scope="row"
                    class="px-3 py-2 text-left"
                  >
                    {{ t('finance.screens.statement.total') }}
                  </th>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ money(total.salesMinor, total.currency) }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ money(total.refundsMinor, total.currency) }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ money(total.otherMinor, total.currency) }}
                  </td>
                  <td class="px-3 py-2 text-right font-semibold tabular-nums">
                    {{ money(total.netMinor, total.currency) }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="text-sm text-muted">
            {{ t('finance.screens.statement.how') }}
          </p>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
