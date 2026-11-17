<!-- Sessions (Box office specification, part 5): every till session, newest first, the cash expected
     against the cash counted and the reason for any difference. A session left being counted, such
     as one whose difference needs a second person, can be closed here by someone allowed to. -->
<script setup lang="ts">
interface Session { id: string, pointLabel: string, openedByName: string, closedByName: string | null, openedAt: number, closedAt: number | null, state: 'open' | 'counting' | 'closed', floatMinor: number, expectedCashMinor: number, countedCashMinor: number | null, varianceMinor: number | null, varianceNote: string | null, currency: string }

const { t } = useT()
const { money, signed } = await useMoney()
const { dateTime: when } = useDates()
const { data, status, error, refresh } = await useAPI<{ sessions: Session[] }>('/api/payments/sessions', { key: 'payments:sessions' })

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
        <UTable
          v-else
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
