<!-- Sessions (Box office specification, part 5): every till session, newest first, the cash expected
     against the cash counted and the reason for any difference. The chart above draws the last twelve
     closed sessions, so a till that is short every Friday shows as a pattern. A session left being
     counted, such as one whose difference needs a second person, can be closed here by someone
     allowed to. Search finds sessions by who opened them. Sessions that handled no cash, as where the
     theatre takes none, leave the cash columns empty and stay out of the chart. The seller's own
     session sits above the list ("Your session"); someone who may sell but not see everyone's
     sessions sees only that. Where the theatre takes no cash and no recent session held any, the cash
     columns are left out, and Your session shows only to someone with a session to look after. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { sessionsList } from '../../../../shared/lists'
import type { YourSession } from '../../../../shared/sessions'

type State = 'open' | 'counting' | 'closed'
interface Row { canClose?: boolean, handlesCash: boolean, id: string, place: string | null, pointLabel: string, closedHow: 'hand' | 'quiet' | null, openedByName: string, closedByName: string | null, openedAt: number, closedAt: number | null, state: State, floatMinor: number, expectedCashMinor: number, countedCashMinor: number | null, varianceMinor: number | null, varianceNote: string | null, currency: string }

const ROUTE = '/api/payments/sessions'
const TONES = { open: 'success', counting: 'warning', closed: 'neutral' } as const

const { t } = useT()
const { money, signed } = await useMoney()
const { dateTime: when, brief } = useDates()
const { data: yours, refresh: refreshYours } = await useAPI<YourSession>('/api/payments/session', { key: 'payments:session' })
// The seller's other devices sell into the same session, so Your session asks again while shown.
const visibility = useDocumentVisibility()
useIntervalFn(() => { if (visibility.value === 'visible') void refreshYours() }, 15_000) // not-policy: how often Your session asks again
const mayViewAll = computed(() => !!yours.value?.mayViewAll)
const { data: recent, refresh: refreshRecent } = await useAPI<{ sessions: Row[] }>('/api/payments/sessions/recent', { key: 'payments:sessions-recent', default: () => ({ sessions: [] }), immediate: mayViewAll.value })
const tillName = (r: Row) => [r.place ?? t('payments.screens.session.unknown-place'), r.pointLabel].filter(Boolean).join(' · ')

// Cash columns only where cash is taken now, or a recent session still held some.
const CASH_COLUMNS = new Set(['expected', 'counted', 'difference'])
const cashShown = computed(() => !!yours.value?.cashTaken || (recent.value?.sessions ?? []).some(s => s.handlesCash))
// Above everyone's sessions, Your session is for someone selling: a session open or being counted,
// or the till's hand-off coming back here. Someone who only reviews the tills is not shown an empty one.
const route = useRoute()
const showYours = computed(() => !!yours.value?.mayOpen && (!mayViewAll.value || !!yours.value.session || !!yours.value.awaiting.length || !!yours.value.waiting.length || !!route.query.attempt))

const list = computed(() => ({
  ...sessionsList,
  filters: {
    state: { ...sessionsList.filters.state, label: t('payments.screens.sessions.state'), options: sessionsList.filters.state.options.map(o => ({ value: o.value, label: t(`payments.screens.session.states.${o.value}`) })) },
    opened: { ...sessionsList.filters.opened, label: t('payments.screens.sessions.opened'), presets: sessionsList.filters.opened.presets.map(p => ({ value: p.value, label: t(`payments.screens.sessions.presets.${p.value}`) })) },
  },
  sorts: { opened: { ...sessionsList.sorts.opened, label: t('payments.screens.sessions.opened') } },
  columns: Object.fromEntries(Object.entries(sessionsList.columns).filter(([key]) => cashShown.value || !CASH_COLUMNS.has(key)).map(([key, c]) => [key, { ...c, label: t(`payments.screens.sessions.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(sessionsList.views).map(([key, v]) => [key, { ...v, label: t(`payments.screens.sessions.view.${key}`) }])),
}))

// Each bar is named for when its session opened, and for its till when there is more than one. Two
// rows with the same name would be drawn as one, so a repeat is numbered.
const bars = computed(() => {
  const counted = (recent.value?.sessions ?? []).filter(s => s.handlesCash)
  const tills = new Set(counted.map(tillName)).size > 1
  const seen = new Map<string, number>()
  return counted.map((s) => {
    const name = tills ? `${tillName(s)}, ${brief(s.openedAt)}` : brief(s.openedAt)
    const times = (seen.get(name) ?? 0) + 1
    seen.set(name, times)
    return { session: times > 1 ? `${name} (${times})` : name, expected: s.expectedCashMinor, counted: s.countedCashMinor ?? 0 }
  })
})
const differing = computed(() => (recent.value?.sessions ?? []).filter(s => s.handlesCash && s.varianceMinor).length)

// Closing a session left being counted needs payments.session.close-any; the route says so on each row.
const closing = ref<Row | null>(null)
const rowActions = (r: Row): DropdownMenuItem[] => (r.canClose
  ? [{ label: t('payments.screens.close.button'), icon: 'i-lucide-lock', onSelect: () => { closing.value = r } }]
  : [])
async function closed() {
  closing.value = null
  await Promise.all([refreshNuxtData(`core:list:${ROUTE}`), refreshRecent(), refreshYours()])
}
async function changed() {
  await refreshYours()
  if (mayViewAll.value) await Promise.all([refreshNuxtData(`core:list:${ROUTE}`), refreshRecent()])
}
</script>

<template>
  <PageFrame
    v-if="!mayViewAll"
    :title="t('payments.navigation.sessions.label')"
    width="reading"
  >
    <PaymentsYourSession
      v-if="yours?.mayOpen"
      :data="yours"
      @changed="changed"
    />
  </PageFrame>
  <PageList
    v-else
    :title="t('payments.navigation.sessions.label')"
    :route="ROUTE"
    :list="list"
    width="full"
    :row-label="(r: Row) => t('payments.screens.sessions.row', { till: tillName(r), when: when(r.openedAt) })"
    :row-actions="rowActions"
    :empty="{ title: t('payments.screens.sessions.empty'), description: t('payments.screens.sessions.empty-help'), icon: 'i-lucide-receipt' }"
  >
    <template
      v-if="yours?.mayOpen && !showYours"
      #primary
    >
      <UButton
        to="/live/till"
        color="neutral"
        variant="outline"
        icon="i-lucide-shopping-basket"
        :label="t('payments.screens.session.open-till')"
      />
    </template>
    <template #before>
      <PaymentsYourSession
        v-if="showYours && yours"
        class="mb-6"
        :data="yours"
        @changed="changed"
      />
    </template>
    <template #cell-till="{ row }">
      <span class="font-medium">{{ tillName(row) }}</span>
      <span
        v-if="row.closedHow === 'quiet'"
        class="block text-sm text-muted"
      >{{ t('payments.screens.sessions.closed-itself') }}</span>
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
      {{ row.handlesCash ? money(row.expectedCashMinor, row.currency) : '' }}
    </template>
    <template #cell-counted="{ row }">
      {{ row.countedCashMinor === null || !row.handlesCash ? '' : money(row.countedCashMinor, row.currency) }}
    </template>
    <template #cell-difference="{ row }">
      <template v-if="!row.handlesCash" />
      <template v-else-if="row.varianceMinor">
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
      :title="t('payments.screens.sessions.close-title', { till: closing ? tillName(closing) : '', person: closing?.openedByName ?? '' })"
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
