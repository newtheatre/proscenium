<!-- Sessions (Box office specification, part 5): every till session, newest first, the cash expected
     against the cash counted and the reason for any difference. The chart above draws the last twelve
     closed sessions, so a till that is short every Friday shows as a pattern. A session left being
     counted, such as one whose difference needs a second person, can be closed here by someone
     allowed to. Search finds sessions by who opened them. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { sessionsList } from '../../../../shared/lists'

type State = 'open' | 'counting' | 'closed'
interface Row { canClose?: boolean, id: string, pointLabel: string, openedByName: string, closedByName: string | null, openedAt: number, closedAt: number | null, state: State, floatMinor: number, expectedCashMinor: number, countedCashMinor: number | null, varianceMinor: number | null, varianceNote: string | null, currency: string }

const ROUTE = '/api/payments/sessions'
const TONES = { open: 'success', counting: 'warning', closed: 'neutral' } as const

const { t } = useT()
const { money, signed } = await useMoney()
const { dateTime: when, brief } = useDates()
const { data: recent, refresh: refreshRecent } = await useAPI<{ sessions: Row[] }>('/api/payments/sessions/recent', { key: 'payments:sessions-recent', default: () => ({ sessions: [] }) })

const list = computed(() => ({
  ...sessionsList,
  filters: {
    state: { ...sessionsList.filters.state, label: t('payments.screens.sessions.state'), options: sessionsList.filters.state.options.map(o => ({ value: o.value, label: t(`payments.screens.session.states.${o.value}`) })) },
    opened: { ...sessionsList.filters.opened, label: t('payments.screens.sessions.opened'), presets: sessionsList.filters.opened.presets.map(p => ({ value: p.value, label: t(`payments.screens.sessions.presets.${p.value}`) })) },
  },
  sorts: { opened: { ...sessionsList.sorts.opened, label: t('payments.screens.sessions.opened') } },
  columns: Object.fromEntries(Object.entries(sessionsList.columns).map(([key, c]) => [key, { ...c, label: t(`payments.screens.sessions.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(sessionsList.views).map(([key, v]) => [key, { ...v, label: t(`payments.screens.sessions.view.${key}`) }])),
}))

// Each bar is named for when its session opened, and for its till when there is more than one. Two
// rows with the same name would be drawn as one, so a repeat is numbered.
const bars = computed(() => {
  const counted = recent.value?.sessions ?? []
  const tills = new Set(counted.map(s => s.pointLabel)).size > 1
  const seen = new Map<string, number>()
  return counted.map((s) => {
    const name = tills ? `${s.pointLabel}, ${brief(s.openedAt)}` : brief(s.openedAt)
    const times = (seen.get(name) ?? 0) + 1
    seen.set(name, times)
    return { session: times > 1 ? `${name} (${times})` : name, expected: s.expectedCashMinor, counted: s.countedCashMinor ?? 0 }
  })
})
const differing = computed(() => (recent.value?.sessions ?? []).filter(s => s.varianceMinor).length)

// Closing a session left being counted needs payments.session.close-any; the route says so on each row.
const closing = ref<Row | null>(null)
const rowActions = (r: Row): DropdownMenuItem[] => (r.canClose
  ? [{ label: t('payments.screens.close.button'), icon: 'i-lucide-lock', onSelect: () => { closing.value = r } }]
  : [])
async function closed() {
  closing.value = null
  await Promise.all([refreshNuxtData(`core:list:${ROUTE}`), refreshRecent()])
}
</script>

<template>
  <PageList
    :title="t('payments.navigation.sessions.label')"
    :route="ROUTE"
    :list="list"
    width="full"
    :row-label="(r: Row) => t('payments.screens.sessions.row', { till: r.pointLabel, when: when(r.openedAt) })"
    :row-actions="rowActions"
    :empty="{ title: t('payments.screens.sessions.empty'), description: t('payments.screens.sessions.empty-help'), icon: 'i-lucide-receipt' }"
  >
    <template #cell-till="{ row }">
      <span class="font-medium">{{ row.pointLabel }}</span>
    </template>
    <template #cell-person="{ row }">
      {{ row.openedByName }}
    </template>
    <template #cell-opened="{ row }">
      {{ when(row.openedAt) }}
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="TONES[row.state as State]"
        :label="t(`payments.screens.session.states.${row.state}`)"
      />
    </template>
    <template #cell-expected="{ row }">
      {{ money(row.expectedCashMinor, row.currency) }}
    </template>
    <template #cell-counted="{ row }">
      {{ row.countedCashMinor === null ? '' : money(row.countedCashMinor, row.currency) }}
    </template>
    <template #cell-difference="{ row }">
      <template v-if="row.varianceMinor">
        <span class="font-medium">{{ signed(row.varianceMinor, row.currency) }}</span>
        <span
          v-if="row.varianceNote"
          class="block text-sm text-muted"
        >{{ row.varianceNote }}</span>
      </template>
      <span
        v-else-if="row.varianceMinor === 0"
        class="text-muted"
      >{{ t('payments.screens.sessions.no-difference') }}</span>
    </template>

    <ChartFigure
      v-if="bars.length > 1"
      class="mt-6"
      :title="t('payments.screens.sessions.chart')"
      :summary="t('payments.screens.sessions.chart-summary', { sessions: bars.length, differing })"
      :data="bars"
      index="session"
      :categories="[{ key: 'expected', label: t('payments.screens.sessions.expected') }, { key: 'counted', label: t('payments.screens.sessions.counted') }]"
      :format="(value: number) => money(value)"
    />

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
  </PageList>
</template>
