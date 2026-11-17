<!-- Refunds (Box office specification, part 5): requests waiting for approval, with who asked and what
     for, and refunds on their way back. A refund one person may not approve alone is refused for the
     person who asked. Cash, and payments taken on a machine not connected to the site, are handed back
     by a person, who confirms it here once they have. Search finds refunds by who asked. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { refundsList } from '../../../../shared/lists'

type State = 'requested' | 'approved' | 'sent' | 'succeeded' | 'failed' | 'declined'
interface Row { id: string, owner: { module: string, record: string }, amountMinor: number, currency: string, method: string, state: State, requestedByName: string | null, approvedByName: string | null, createdAt: number, handBack: boolean }

const ROUTE = '/api/payments/refunds'
const TONES = { requested: 'warning', approved: 'info', sent: 'info', succeeded: 'success', failed: 'danger', declined: 'neutral' } as const

const { t, te } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime: when } = useDates()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data: reasons } = await useAPI<{ reasons: { id: string, label: string }[] }>('/api/payments/refunds/decline-reasons', { key: 'payments:decline-reasons', default: () => ({ reasons: [] }) })

const list = computed(() => ({
  ...refundsList,
  filters: { state: { ...refundsList.filters.state, label: t('payments.screens.refunds.column.state'), options: refundsList.filters.state.options.map(o => ({ value: o.value, label: t(`payments.screens.refunds.states.${o.value}`) })) } },
  sorts: { requested: { ...refundsList.sorts.requested, label: t('payments.screens.refunds.column.requested') } },
  columns: Object.fromEntries(Object.entries(refundsList.columns).map(([key, c]) => [key, { ...c, label: t(`payments.screens.refunds.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(refundsList.views).map(([key, v]) => [key, { ...v, label: t(`payments.screens.refunds.view.${key}`) }])),
}))

const methodLabel = (method: string) => t(`payments.screens.methods.${method}`)
const ownerLabel = (r: Row) => (te(`${r.owner.module}.module.name`) ? t(`${r.owner.module}.module.name`) : r.owner.module)
const thing = (r: Row) => t('payments.screens.refunds.thing', { amount: money(r.amountMinor, r.currency), method: methodLabel(r.method) })
const fail = (e: unknown) => {
  const refusal = toRefusal(e)
  toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
}

async function act(r: Row, verb: 'approve' | 'confirm') {
  const ok = await confirm({
    verb: t(`payments.screens.refunds.${verb}-verb`),
    thing: thing(r),
    consequence: t(`payments.screens.refunds.${verb}-consequence`),
    button: t(`payments.screens.refunds.${verb}-button`),
  })
  if (!ok) return
  try {
    await $api(`/api/payments/refunds/${r.id}/${verb}` as string, { method: 'POST', body: {} })
    toast.add({ title: t(`payments.screens.refunds.${verb}-done`), color: 'success' })
    await refreshNuxtData(`core:list:${ROUTE}`)
  }
  catch (e) {
    fail(e)
  }
}

const declining = ref<Row | null>(null)
const reason = ref<string | undefined>(undefined)
const declineRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openDecline(r: Row) {
  declining.value = r
  reason.value = undefined
  declineRefusal.value = null
}
async function decline() {
  if (!declining.value || !reason.value) return
  declineRefusal.value = null
  try {
    await $api(`/api/payments/refunds/${declining.value.id}/decline` as string, { method: 'POST', body: { reasonTermId: reason.value } })
    declining.value = null
    toast.add({ title: t('payments.screens.refunds.declined'), color: 'success' })
    await refreshNuxtData(`core:list:${ROUTE}`)
  }
  catch (e) {
    declineRefusal.value = toRefusal(e)
  }
}

const rowActions = (r: Row): DropdownMenuItem[] => {
  if (r.state === 'requested') {
    return [
      { label: t('payments.screens.refunds.approve-button'), icon: 'i-lucide-check', onSelect: () => { void act(r, 'approve') } },
      { label: t('payments.screens.refunds.decline-button'), icon: 'i-lucide-x', onSelect: () => openDecline(r) },
    ]
  }
  if (r.state === 'approved' && r.handBack) return [{ label: t('payments.screens.refunds.confirm-button'), icon: 'i-lucide-hand-coins', onSelect: () => { void act(r, 'confirm') } }]
  return []
}
</script>

<template>
  <PageList
    :title="t('payments.navigation.refunds.label')"
    :route="ROUTE"
    :list="list"
    :row-label="(r: Row) => thing(r)"
    :row-actions="rowActions"
    :empty="{ title: t('payments.screens.refunds.empty.title'), description: t('payments.screens.refunds.empty-help'), icon: 'i-lucide-undo-2' }"
  >
    <template #cell-amount="{ row }">
      <span class="font-medium">{{ money(row.amountMinor, row.currency) }}</span>
    </template>
    <template #cell-method="{ row }">
      {{ methodLabel(row.method) }}
    </template>
    <template #cell-owner="{ row }">
      {{ ownerLabel(row) }}
    </template>
    <template #cell-requested="{ row }">
      {{ t('payments.screens.refunds.asked', { person: row.requestedByName ?? t('payments.screens.refunds.the-system'), when: when(row.createdAt) }) }}
      <span
        v-if="row.approvedByName"
        class="block text-sm text-muted"
      >{{ t('payments.screens.refunds.approved-by', { person: row.approvedByName }) }}</span>
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="TONES[row.state as State]"
        :label="t(`payments.screens.refunds.states.${row.state}`)"
      />
    </template>

    <UModal
      :open="!!declining"
      :title="t('payments.screens.refunds.decline-title')"
      @update:open="(open: boolean) => { if (!open) declining = null }"
    >
      <template #body>
        <UForm
          id="decline-refund"
          class="space-y-4"
          :state="{ reason }"
          @submit="decline"
        >
          <RefusalNotice :refusal="declineRefusal" />
          <UFormField
            :label="t('payments.screens.refunds.decline-reason')"
            required
          >
            <USelect
              v-model="reason"
              :items="reasons?.reasons.map(r => ({ value: r.id, label: r.label })) ?? []"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="decline-refund"
          :disabled="!reason"
          :label="t('payments.screens.refunds.decline-button')"
        />
      </template>
    </UModal>
  </PageList>
</template>
