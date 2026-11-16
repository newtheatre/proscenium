<!-- Periods (Box office specification, part 5): every accounting period, open or closed, with its
     totals. Opening one shows what stops it being closed. -->
<script setup lang="ts">
interface Period { id: string, label: string, startsOn: string, endsOn: string, closed: boolean, debitsMinor: number }

const { t } = useT()
const { money } = await useMoney()
const { data, status, error, refresh } = await useAPI<{ periods: Period[] }>('/api/finance/periods', { key: 'finance:periods' })
const newestFirst = computed(() => [...(data.value?.periods ?? [])].reverse())
const dateOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
</script>

<template>
  <PageFrame :title="t('finance.navigation.periods.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!newestFirst.length"
        :title="t('finance.screens.periods.empty')"
        :description="t('finance.screens.periods.empty-help')"
        icon="i-lucide-calendar-check"
      />
      <ul
        v-else
        class="divide-y divide-default rounded-lg border border-default"
      >
        <li
          v-for="p in newestFirst"
          :key="p.id"
        >
          <NuxtLink
            :to="`/console/finance/periods/${p.id}`"
            class="flex flex-wrap items-center gap-3 px-3 py-2 hover:bg-elevated/50"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                {{ p.label }}
              </p>
              <p class="text-sm text-muted">
                {{ t('finance.screens.periods.range', { from: dateOf(p.startsOn), to: dateOf(p.endsOn) }) }}
              </p>
            </div>
            <span class="tabular-nums text-sm text-muted">{{ t('finance.screens.periods.moved', { amount: money(p.debitsMinor) }) }}</span>
            <StatusBadge
              :tone="p.closed ? 'neutral' : 'success'"
              :label="t(p.closed ? 'finance.screens.periods.closed' : 'finance.screens.periods.open')"
            />
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
