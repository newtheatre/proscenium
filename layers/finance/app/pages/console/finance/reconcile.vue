<!-- Reconciliation (Box office specification, part 5; FIN-06, first release by totals): what each
     clearing account holds, which should equal the payouts still to come from its provider, with
     what payouts have taken out so far and when the last was entered. Line-by-line matching is later. -->
<script setup lang="ts">
interface Line { accountId: string, code: string, name: string, currency: string, balanceMinor: number, paidOutMinor: number, lastPayoutAt: number | null }

const { t } = useT()
const { money } = await useMoney()
const { day } = useDates()
const { data, status, error, refresh } = await useAPI<{ accounts: Line[] }>('/api/finance/reconcile', { key: 'finance:reconcile' })
</script>

<template>
  <PageFrame
    :title="t('finance.navigation.reconcile.label')"
    :description="t('finance.screens.reconcile.help')"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.accounts.length"
        :title="t('finance.screens.reconcile.empty')"
        :description="t('finance.screens.reconcile.empty-help')"
        icon="i-lucide-scale"
      />
      <RecordList
        v-else
        :label="t('finance.navigation.reconcile.label')"
      >
        <RecordListItem
          v-for="a in data.accounts"
          :key="`${a.accountId}:${a.currency}`"
          :description="a.lastPayoutAt ? t('finance.screens.reconcile.last-payout', { day: day(a.lastPayoutAt), total: money(a.paidOutMinor, a.currency) }) : t('finance.screens.reconcile.no-payout')"
        >
          <template #name>
            <ULink :to="{ path: '/console/finance/ledger', query: { accountId: a.accountId } }">
              <span class="text-muted">{{ a.code }}</span> {{ a.name }}
            </ULink>
          </template>
          <div class="text-right">
            <p class="text-sm text-muted">
              {{ t('finance.screens.reconcile.awaiting') }}
            </p>
            <p class="font-semibold tabular-nums">
              {{ money(a.balanceMinor, a.currency) }}
            </p>
          </div>
        </RecordListItem>
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
