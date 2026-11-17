<!-- Production statements (Box office specification, part 5; FIN-04): every production with money in
     the ledger, with its income so far. Opening one shows its statement. -->
<script setup lang="ts">
interface Row { productionId: string, title: string, currency: string, netMinor: number }

const { t } = useT()
const { money } = await useMoney()
const { data, status, error, refresh } = await useAPI<{ productions: Row[] }>('/api/finance/productions', { key: 'finance:productions' })
</script>

<template>
  <PageFrame :title="t('finance.navigation.productions.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.productions.length"
        :title="t('finance.screens.productions.empty')"
        :description="t('finance.screens.productions.empty-help')"
        icon="i-lucide-drama"
      />
      <RecordList
        v-else
        :label="t('finance.navigation.productions.label')"
      >
        <RecordListItem
          v-for="p in data.productions"
          :key="`${p.productionId}:${p.currency}`"
          :to="`/console/finance/productions/${p.productionId}`"
          :name="p.title"
        >
          <span class="tabular-nums">{{ money(p.netMinor, p.currency) }}</span>
        </RecordListItem>
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
