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
      <ul
        v-else
        class="divide-y divide-default rounded-lg border border-default"
      >
        <li
          v-for="p in data.productions"
          :key="`${p.productionId}:${p.currency}`"
        >
          <NuxtLink
            :to="`/console/finance/productions/${p.productionId}`"
            class="flex items-center gap-3 px-3 py-2 hover:bg-elevated/50"
          >
            <span class="flex-1 font-medium">{{ p.title }}</span>
            <span class="tabular-nums">{{ money(p.netMinor, p.currency) }}</span>
            <UIcon
              name="i-lucide-chevron-right"
              class="text-muted"
            />
          </NuxtLink>
        </li>
      </ul>
    </DataBoundary>
  </PageFrame>
</template>
