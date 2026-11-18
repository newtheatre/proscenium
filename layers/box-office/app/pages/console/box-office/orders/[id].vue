<!-- One order (Box office specification, part 6, "Order"): its tickets and whether each has been
     used, its cancellations, and what may be done with it now. The server says which of release,
     cancel, refund and exchange the viewer may do; a reservation can also be kept past its release time. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'console' })

type State = 'reserved' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'expired'
interface Line { id: string, kind: string, bandId: string | null, band: string | null, ticketTypeId: string | null, ticketType: string | null, amountMinor: number, state: string, admittedAt: number | null, ticketState: string | null, requirementPending?: boolean }
interface Cancellation { id: string, kind: string, note: string | null, lineCount: number, refunded: boolean, feeMinor: number, reason: string | null, by: string | null, at: number }
interface Order {
  id: string
  reference: string
  state: State
  channel: 'online' | 'desk' | 'phone'
  currency: string
  totalMinor: number
  complimentary: boolean
  keep: boolean
  releaseAt: number | null
  createdAt: number
  confirmedAt: number | null
  cancelledAt: number | null
  buyer: { id: string, name: string } | null
  soldBy: string | null
  performance: { id: string, title: string, startsAt: number } | null
  lines: Line[]
  cancellationFeeMinor: number
  cancellations: Cancellation[]
  can: { release: boolean, cancel: boolean, refund: boolean, exchange: boolean }
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()
const { day, dateTime } = useDates()
const { money } = await useMoney()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAPI<Order>(() => `/api/box-office/orders/${encodeURIComponent(id.value)}`, { key: `box-office:order:${id.value}` })

const TONES = { reserved: 'warning', awaiting_payment: 'info', confirmed: 'success', cancelled: 'neutral', expired: 'neutral' } as const
const cancelling = ref(false)
const exchanging = ref(false)
// What can be exchanged: live tickets not yet used at the door.
const exchangeable = computed(() => (data.value?.lines ?? []).filter(l => l.kind === 'ticket' && l.state === 'live' && !l.admittedAt))
// What can be cancelled: live tickets. Those used at the door are shown in the dialogue but cannot be ticked.
const cancellable = computed(() => (data.value?.lines ?? []).filter(l => l.kind === 'ticket' && l.state === 'live'))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const at = (action: string): string => `/api/box-office/orders/${encodeURIComponent(id.value)}/${action}`

// Does the act, then says so, with an Undo that does its reverse where there is one.
async function act(run: () => Promise<unknown>, done: string, undo?: () => Promise<unknown>) {
  refusal.value = null
  try {
    await run()
    await refresh()
    if (undo) {
      offer(done, async () => {
        await undo()
        await refresh()
      })
    }
    else toast.add({ title: done, color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function release() {
  const o = data.value!
  if (!await confirm({ verb: t('box-office.order.release.verb'), thing: t('box-office.order.thing', { reference: o.reference }), consequence: t('box-office.order.release.consequence'), button: t('box-office.order.release.button') })) return
  await act(() => $api(at('release'), { method: 'POST', body: {} }), t('box-office.order.release.done'))
}
const keeping = (value: boolean) => $api(at('keep'), { method: 'POST', body: { keep: value } })
async function keep(value: boolean) {
  await act(() => keeping(value), t(value ? 'box-office.order.keep.done' : 'box-office.order.keep.undone'), () => keeping(!value))
}

const actions = computed<DropdownMenuItem[][]>(() => {
  const o = data.value
  if (!o) return []
  const groups: DropdownMenuItem[][] = []
  if (o.can.release) groups.push([{ label: t(o.keep ? 'box-office.order.keep.off' : 'box-office.order.keep.on'), icon: 'i-lucide-bookmark', onSelect: () => { void keep(!o.keep) } }])
  if (o.can.exchange && exchangeable.value.length) groups.push([{ label: t('box-office.order.exchange.title'), icon: 'i-lucide-arrow-left-right', onSelect: () => { exchanging.value = true } }])
  const destructive: DropdownMenuItem[] = []
  if (o.can.release) destructive.push({ label: t('box-office.order.release.button'), icon: 'i-lucide-undo-2', onSelect: () => { void release() } })
  if (o.can.cancel && cancellable.value.some(l => o.state !== 'confirmed' || !l.admittedAt)) destructive.push({ label: t('box-office.order.cancel.title'), icon: 'i-lucide-circle-x', color: 'error', onSelect: () => { cancelling.value = true } })
  if (destructive.length) groups.push(destructive)
  return groups
})

const summary = computed(() => {
  const o = data.value
  if (!o) return []
  return [
    { label: t('box-office.order.performance'), value: o.performance ? `${o.performance.title}, ${dateTime(o.performance.startsAt)}` : '' },
    { label: t('box-office.order.buyer'), value: o.buyer?.name ?? t('box-office.orders.no-buyer') },
    { label: t('box-office.order.total'), value: money(o.totalMinor, o.currency) },
    { label: t('box-office.order.sold'), value: t(`box-office.orders.channel.${o.channel}`) },
    { label: t('box-office.order.made'), value: day(o.createdAt) },
    ...(o.state === 'reserved' && o.releaseAt ? [{ label: t('box-office.order.releases'), value: o.keep ? t('box-office.order.kept') : dateTime(o.releaseAt) }] : []),
  ]
})
const trail = computed(() => [{ label: t('box-office.navigation.orders.label'), to: '/console/box-office/orders' }])
const tickets = computed(() => (data.value?.lines ?? []).filter(l => l.kind === 'ticket'))
const lineStatus = (l: Line) => l.state !== 'live'
  ? { tone: 'neutral' as const, label: t(`box-office.order.line.${l.state}`) }
  : l.admittedAt
    ? { tone: 'success' as const, label: t('box-office.order.line.admitted') }
    : null
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageRecord
        :title="t('box-office.order.title', { reference: d.reference })"
        :status="{ label: t(`box-office.orders.state.${d.state === 'confirmed' && d.complimentary ? 'complimentary' : d.state}`), tone: TONES[d.state as State] }"
        :actions="actions"
        :summary="summary"
        record-type="box-office.order"
        :record-id="d.id"
        :tabs="[{ id: 'tickets', label: t('box-office.order.tickets') }]"
        :trail="trail"
      >
        <template #tab-tickets>
          <div class="space-y-6">
            <RefusalNotice :refusal="refusal" />
            <RecordList :label="t('box-office.order.tickets')">
              <RecordListItem
                v-for="line in tickets"
                :key="line.id"
                :name="t('box-office.order.line.title', { band: line.band ?? '', type: line.ticketType ?? '' })"
                :description="line.requirementPending && line.state === 'live' ? t('box-office.order.line.pending') : undefined"
                :muted="line.state !== 'live'"
              >
                <span class="flex items-center gap-2">
                  <StatusBadge
                    v-if="lineStatus(line)"
                    :tone="lineStatus(line)!.tone"
                    :label="lineStatus(line)!.label"
                  />
                  <span>{{ money(line.amountMinor, d.currency) }}</span>
                </span>
              </RecordListItem>
            </RecordList>
            <PageSection
              v-if="d.cancellations.length"
              :title="t('box-office.order.cancellations')"
            >
              <RecordList>
                <RecordListItem
                  v-for="c in d.cancellations"
                  :key="c.id"
                  :name="t(c.kind === 'exchange' ? 'box-office.order.cancellation.exchange-title' : 'box-office.order.cancellation.title', { count: c.lineCount, when: dateTime(c.at) })"
                  :description="[c.reason, c.note, c.by ? t('box-office.order.cancellation.by', { name: c.by }) : null, c.refunded ? t('box-office.order.cancellation.refunded') : null].filter(Boolean).join(' · ')"
                />
              </RecordList>
            </PageSection>
          </div>
        </template>
      </PageRecord>
      <BoxOfficeCancelDialog
        v-model:open="cancelling"
        :order-id="d.id"
        :reference="d.reference"
        :paid="d.state === 'confirmed'"
        :can-refund="d.can.refund"
        :currency="d.currency"
        :fee-minor="d.cancellationFeeMinor"
        :lines="cancellable"
        @cancelled="refresh()"
      />
      <BoxOfficeExchangeDialog
        v-model:open="exchanging"
        :order-id="d.id"
        :reference="d.reference"
        :currency="d.currency"
        :lines="exchangeable"
        @exchanged="refresh()"
      />
    </template>
  </DataBoundary>
</template>
