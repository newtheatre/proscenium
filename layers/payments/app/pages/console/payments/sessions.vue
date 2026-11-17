<!-- Sessions (Box office specification, part 5): every till session, newest first, the cash expected
     against the cash counted and the reason for any difference. A session left being counted, such
     as one whose difference needs a second person, can be closed here by someone allowed to. -->
<script setup lang="ts">
interface Session { id: string, pointLabel: string, openedByName: string, closedByName: string | null, openedAt: number, closedAt: number | null, state: 'open' | 'counting' | 'closed', floatMinor: number, expectedCashMinor: number, countedCashMinor: number | null, varianceMinor: number | null, varianceNote: string | null, currency: string }

const { t } = useT()
const { money, signed, currency } = await useMoney()
const { dateTime: when, brief } = useDates()
const { data, status, error, refresh } = await useAPI<{ sessions: Session[] }>('/api/payments/sessions', { key: 'payments:sessions' })

// The last twelve closed sessions, oldest first, so a till that is short every Friday shows as a
// pattern. The figures themselves are in the table beneath.
const counted = computed(() => (data.value?.sessions ?? [])
  .filter(s => s.state === 'closed' && s.countedCashMinor !== null && s.currency === currency.value)
  .slice(0, 12).reverse())
// Each bar is named for when its session opened, and for its till when there is more than one. Two
// rows with the same name would be drawn as one, so a repeat is numbered.
const bars = computed(() => {
  const tills = new Set(counted.value.map(s => s.pointLabel)).size > 1
  const seen = new Map<string, number>()
  return counted.value.map((s) => {
    const name = tills ? `${s.pointLabel}, ${brief(s.openedAt)}` : brief(s.openedAt)
    const times = (seen.get(name) ?? 0) + 1
    seen.set(name, times)
    return { session: times > 1 ? `${name} (${times})` : name, expected: s.expectedCashMinor, counted: s.countedCashMinor ?? 0 }
  })
})
const differing = computed(() => counted.value.filter(s => s.varianceMinor).length)

const closing = ref<Session | null>(null)
const tone = (s: Session) => (s.state === 'open' ? 'success' : s.state === 'counting' ? 'warning' : 'neutral')
const columns = [
  { accessorKey: 'pointLabel', header: t('payments.screens.sessions.till') },
  { accessorKey: 'openedByName', header: t('payments.screens.sessions.opened-by') },
  { accessorKey: 'openedAt', header: t('payments.screens.sessions.opened') },
  { accessorKey: 'state', header: t('payments.screens.sessions.state') },
  { accessorKey: 'expectedCashMinor', header: t('payments.screens.sessions.expected') },
  { accessorKey: 'countedCashMinor', header: t('payments.screens.sessions.counted') },
  { accessorKey: 'varianceMinor', header: t('payments.screens.sessions.difference') },
  { id: 'actions', header: '' },
]

async function closed() {
  closing.value = null
  await refresh()
}
</script>

<template>
  <PageFrame :title="t('payments.navigation.sessions.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <EmptyState
          v-if="!loaded.sessions.length"
          :title="t('payments.screens.sessions.empty')"
          :description="t('payments.screens.sessions.empty-help')"
          icon="i-lucide-receipt"
        />
        <div
          v-else
          class="space-y-6"
        >
          <ChartFigure
            v-if="bars.length > 1"
            :title="t('payments.screens.sessions.chart')"
            :summary="t('payments.screens.sessions.chart-summary', { sessions: bars.length, differing })"
            :data="bars"
            index="session"
            :categories="[{ key: 'expected', label: t('payments.screens.sessions.expected') }, { key: 'counted', label: t('payments.screens.sessions.counted') }]"
            :format="(value: number) => money(value)"
          />
          <UTable
            :data="loaded.sessions"
            :columns="columns"
            :aria-label="t('payments.navigation.sessions.label')"
          >
            <template #openedAt-cell="{ row }">
              {{ when(row.original.openedAt) }}
            </template>
            <template #state-cell="{ row }">
              <StatusBadge
                :tone="tone(row.original)"
                :label="t(`payments.screens.session.states.${row.original.state}`)"
              />
            </template>
            <template #expectedCashMinor-cell="{ row }">
              {{ money(row.original.expectedCashMinor, row.original.currency) }}
            </template>
            <template #countedCashMinor-cell="{ row }">
              {{ row.original.countedCashMinor === null ? '' : money(row.original.countedCashMinor, row.original.currency) }}
            </template>
            <template #varianceMinor-cell="{ row }">
              <template v-if="row.original.varianceMinor">
                <span class="font-medium">{{ signed(row.original.varianceMinor, row.original.currency) }}</span>
                <span
                  v-if="row.original.varianceNote"
                  class="block text-sm text-muted"
                >{{ row.original.varianceNote }}</span>
              </template>
              <span
                v-else-if="row.original.varianceMinor === 0"
                class="text-muted"
              >{{ t('payments.screens.sessions.no-difference') }}</span>
              <span v-else />
            </template>
            <template #actions-cell="{ row }">
              <UButton
                v-if="row.original.state === 'counting'"
                :label="t('payments.screens.close.button')"
                color="neutral"
                variant="outline"
                size="sm"
                @click="closing = row.original"
              />
            </template>
          </UTable>
        </div>
      </template>
    </DataBoundary>

    <UModal
      :open="!!closing"
      :title="t('payments.screens.sessions.close-title', { till: closing?.pointLabel ?? '', person: closing?.openedByName ?? '' })"
      @update:open="(open: boolean) => { if (!open) closing = null }"
    >
      <template #body>
        <PaymentsCloseSession
          v-if="closing"
          :session="closing"
          @closed="closed"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
