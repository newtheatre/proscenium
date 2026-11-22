<!-- One order (Box office specification, part 6, "Order"): its tickets, alike ones counted together,
     and whether each has been used; what was paid, how and by whom, and every refund with where it
     stands; its cancellations; and what may be done with it now. The server says which of collect,
     release, cancel, refund, exchange and assign the viewer may do; a reservation can also be kept past
     its release time. A booking nobody owns can be given to a person. A reservation is cancelled one way, and a paid booking's tickets another. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'console' })

type State = 'reserved' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'expired'
interface Line { id: string, kind: string, bandId: string | null, band: string | null, section?: string | null, ticketTypeId: string | null, ticketType: string | null, amountMinor: number, state: string, admittedAt: number | null, ticketState: string | null, requirementPending?: boolean, passEntry?: boolean }
interface Cancellation { id: string, kind: string, note: string | null, lineCount: number, refunded: boolean, feeMinor: number, reason: string | null, by: string | null, at: number }
interface Payment { intentId: string, amountMinor: number, refundedMinor: number, methods: string[], takenBy: string | null, point: string | null, at: number }
type RefundState = 'requested' | 'approved' | 'sent' | 'succeeded' | 'failed' | 'declined'
interface Refund { id: string, amountMinor: number, method: string, state: RefundState, handBack: boolean, requestedBy: string | null, approvedBy: string | null, at: number }
interface Order {
  id: string
  reference: string
  state: State
  channel: 'online' | 'desk' | 'phone'
  currency: string
  totalMinor: number
  complimentary: boolean
  pass: OrderPass | null
  passes: { id: string, passTypeId: string, name: string, priceName: string, code: string | null, state: 'active' | 'void', paid: boolean, holder: string | null, holderId: string | null, how: 'bought' | 'entry', entries: number }[]
  compPending: boolean
  compNeedsApproval: boolean
  keep: boolean
  releaseAt: number | null
  createdAt: number
  confirmedAt: number | null
  cancelledAt: number | null
  buyer: { id: string, name: string, email: string | null } | null
  soldBy: string | null
  performance: { id: string, title: string, startsAt: number } | null
  lines: Line[]
  cancellationFeeMinor: number
  payments: Payment[]
  refunds: Refund[]
  cancellations: Cancellation[]
  can: { release: boolean, print?: boolean, collect: boolean, cancel: boolean, refund: boolean, exchange: boolean, comp: boolean, assign: boolean }
}

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()
const { dateTime } = useDates()
const { money } = await useMoney()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAPI<Order>(() => `/api/box-office/orders/${encodeURIComponent(id.value)}`, { key: `box-office:order:${id.value}` })

const cancelling = ref(false)
const exchanging = ref(false)
const comping = ref(false)
const assigning = ref(false)
// What can be exchanged: live tickets not yet used at the door.
const exchangeable = computed(() => (data.value?.lines ?? []).filter(l => l.kind === 'ticket' && l.state === 'live' && !l.admittedAt))
// What can be cancelled: live tickets. Those used at the door start unticked in the dialogue and stay admitted.
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
  if (o.can.print) groups.push([{ label: t('box-office.screens.panel.sold.print'), icon: 'i-lucide-printer', to: `/console/box-office/orders/${encodeURIComponent(o.id)}/print`, target: '_blank' }])
  if (o.can.assign) groups.push([{ label: t('box-office.order.assign.action'), icon: 'i-lucide-user-plus', onSelect: () => { assigning.value = true } }])
  if (o.can.release) groups.push([{ label: t(o.keep ? 'box-office.order.keep.off' : 'box-office.order.keep.on'), icon: 'i-lucide-bookmark', onSelect: () => { void keep(!o.keep) } }])
  if (o.can.comp && !o.compPending) groups.push([{ label: t('box-office.order.comp.action'), icon: 'i-lucide-gift', onSelect: () => { comping.value = true } }])
  if (o.can.exchange && exchangeable.value.length) groups.push([{ label: t('box-office.order.exchange.title'), icon: 'i-lucide-arrow-left-right', onSelect: () => { exchanging.value = true } }])
  // One way to undo a reservation: the cancel dialogue, which can leave some tickets on it, or, for
  // someone who may only release, releasing it whole. A paid booking's tickets are cancelled.
  const destructive: DropdownMenuItem[] = []
  const paid = o.state === 'confirmed'
  if (o.can.cancel && cancellable.value.length)
    destructive.push({ label: t(paid ? 'box-office.order.cancel.title' : 'box-office.order.cancel.reservation-title'), icon: 'i-lucide-circle-x', color: 'error', onSelect: () => { cancelling.value = true } })
  else if (o.can.release)
    destructive.push({ label: t('box-office.order.release.button'), icon: 'i-lucide-circle-x', color: 'error', onSelect: () => { void release() } })
  if (destructive.length) groups.push(destructive)
  return groups
})
const primary = computed(() => data.value?.can.collect
  ? { label: t('box-office.order.collect'), icon: 'i-lucide-banknote', to: `/console/box-office/sell?collect=${encodeURIComponent(data.value.reference)}` }
  : undefined)

const sold = (o: Order) => o.soldBy && o.channel !== 'online'
  ? t('box-office.order.sold-by', { channel: t(`box-office.orders.channel.${o.channel}`), name: o.soldBy })
  : t(`box-office.orders.channel.${o.channel}`)
const summary = computed(() => {
  const o = data.value
  if (!o) return []
  return [
    { label: t('box-office.order.performance'), value: o.performance ? `${o.performance.title}, ${dateTime(o.performance.startsAt)}` : '', to: o.performance ? `/console/box-office/performances/${encodeURIComponent(o.performance.id)}` : undefined },
    { label: t('box-office.order.buyer'), value: o.buyer?.name ?? t('box-office.orders.no-buyer') },
    ...(o.buyer?.email ? [{ label: t('box-office.order.email'), value: o.buyer.email, to: `mailto:${o.buyer.email}` }] : []),
    { label: t('box-office.order.total'), value: money(o.totalMinor, o.currency) },
    ...(o.pass ? [{ label: t('box-office.order.pass'), value: t(o.pass.paid ? 'box-office.order.pass-paid' : 'box-office.order.pass-unpaid', { name: o.pass.name }) }] : []),
    { label: t('box-office.order.sold'), value: sold(o) },
    { label: t('box-office.order.made'), value: dateTime(o.createdAt) },
    ...(o.compPending ? [{ label: t('box-office.order.comp.summary'), value: t('box-office.order.comp.pending'), to: '/console/box-office/comps' }] : []),
    ...(o.state === 'reserved' && o.releaseAt ? [{ label: t('box-office.order.releases'), value: o.keep ? t('box-office.order.kept') : dateTime(o.releaseAt) }] : []),
  ]
})
const passDetail = (p: Order['passes'][number]) => [
  p.priceName,
  p.code ? t('box-office.order.passes.code', { code: p.code }) : null,
  p.holder ? t('box-office.order.passes.holder', { name: p.holder }) : t('box-office.order.passes.no-holder'),
  p.state === 'void' ? t('box-office.order.passes.void') : p.paid ? null : t('box-office.order.passes.unpaid'),
].filter(Boolean).join(' · ')
const trail = computed(() => [{ label: t('box-office.navigation.orders.label'), to: '/console/box-office/orders' }])

// Alike tickets are one row: the same seats, type, price and state, and each used at the door or not.
const tickets = computed(() => {
  const groups = new Map<string, { line: Line, count: number }>()
  for (const l of (data.value?.lines ?? []).filter(l => l.kind === 'ticket')) {
    const pending = !!l.requirementPending && l.state === 'live'
    const key = [l.bandId, l.ticketTypeId, l.amountMinor, l.state, !!l.admittedAt, pending].join('|')
    const group = groups.get(key)
    if (group) group.count++
    else groups.set(key, { line: l, count: 1 })
  }
  return [...groups.values()]
})
const lineName = (l: Line, count: number) => {
  const name = l.section ? t('box-office.order.line.title', { band: l.section, type: l.ticketType ?? '' }) : l.ticketType ?? ''
  return count > 1 ? t('box-office.order.line.times', { count, name }) : name
}
const lineStatus = (l: Line) => l.state !== 'live'
  ? { tone: 'neutral' as const, label: t(`box-office.order.line.${l.state}`) }
  : l.admittedAt
    ? { tone: 'success' as const, label: t('box-office.order.line.admitted') }
    : null

// Payments: what was paid, how and by whom; then each refund, where it stands, and whether
// somebody has to hand the money back.
const method = (m: string) => t(`box-office.order.payment.method.${m}`)
const paymentName = (o: Order, p: Payment) => t('box-office.order.payment.title', { amount: money(p.amountMinor, o.currency), how: p.methods.map(method).join(', ') || t('box-office.order.payment.method.other_attested') })
const paymentDetail = (o: Order, p: Payment) => [
  p.takenBy ? t(p.point ? 'box-office.order.payment.taken-at' : 'box-office.order.payment.taken', { name: p.takenBy, point: p.point ?? '' }) : t('box-office.order.payment.online'),
  dateTime(p.at),
  p.refundedMinor ? t('box-office.order.payment.refunded', { amount: money(p.refundedMinor, o.currency) }) : null,
].filter(Boolean).join(', ')
const REFUND_TONES = { requested: 'warning', approved: 'info', sent: 'info', succeeded: 'success', failed: 'danger', declined: 'neutral' } as const
const refundDetail = (o: Order, r: Refund) => {
  const out = [r.requestedBy ? t('box-office.order.refund.asked', { name: r.requestedBy, when: dateTime(r.at) }) : dateTime(r.at)]
  if (r.approvedBy && r.state !== 'requested') out.push(t('box-office.order.refund.approved-by', { name: r.approvedBy }))
  if (r.state === 'requested') out.push(t('box-office.order.refund.waiting'))
  if (r.handBack && (r.state === 'requested' || r.state === 'approved'))
    out.push(t(`box-office.order.refund.hand-back-${r.method === 'cash' ? 'cash' : 'card'}${r.state === 'requested' ? '-later' : ''}`, { amount: money(r.amountMinor, o.currency) }))
  return out.join('. ')
}
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
        :status="orderStateBadge(d, t)"
        :primary="primary"
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
            <PageSection :title="t('box-office.order.tickets')">
              <RecordList :label="t('box-office.order.tickets')">
                <RecordListItem
                  v-for="{ line, count } in tickets"
                  :key="line.id"
                  :name="lineName(line, count)"
                  :description="[count > 1 ? t('box-office.order.line.each', { price: money(line.amountMinor, d.currency) }) : null, line.requirementPending && line.state === 'live' ? t('box-office.order.line.pending') : null].filter(Boolean).join(' ') || undefined"
                  :muted="line.state !== 'live'"
                >
                  <span class="flex items-center gap-2">
                    <StatusBadge
                      v-if="lineStatus(line)"
                      :tone="lineStatus(line)!.tone"
                      :label="lineStatus(line)!.label"
                    />
                    <span>{{ money(line.amountMinor * count, d.currency) }}</span>
                  </span>
                </RecordListItem>
              </RecordList>
            </PageSection>
            <PageSection
              v-if="d.passes.length"
              :title="t('box-office.order.passes.title')"
            >
              <RecordList :label="t('box-office.order.passes.title')">
                <RecordListItem
                  v-for="p in d.passes"
                  :key="p.id"
                  icon="i-lucide-ticket"
                  :to="`/console/box-office/passes?holders=${encodeURIComponent(p.passTypeId)}`"
                  :name="t(p.how === 'bought' ? 'box-office.order.passes.bought' : 'box-office.order.passes.used', { name: p.name })"
                  :description="passDetail(p)"
                  :muted="p.state === 'void'"
                >
                  <StatusBadge
                    v-if="p.state === 'void'"
                    tone="warning"
                    :label="t('box-office.order.passes.void-badge')"
                  />
                </RecordListItem>
              </RecordList>
            </PageSection>
            <PageSection :title="t('box-office.order.payments')">
              <p
                v-if="!d.payments.length && !d.refunds.length"
                class="text-sm text-muted"
              >
                {{ d.state === 'reserved' ? t('box-office.order.payment.none-reserved', { amount: money(d.totalMinor, d.currency) }) : t('box-office.order.payment.none') }}
              </p>
              <RecordList
                v-else
                :label="t('box-office.order.payments')"
              >
                <RecordListItem
                  v-for="p in d.payments"
                  :key="p.intentId"
                  icon="i-lucide-banknote"
                  :name="paymentName(d, p)"
                  :description="paymentDetail(d, p)"
                />
                <RecordListItem
                  v-for="r in d.refunds"
                  :key="r.id"
                  icon="i-lucide-undo-2"
                  :name="t('box-office.order.refund.title', { amount: money(r.amountMinor, d.currency), how: method(r.method) })"
                  :description="refundDetail(d, r)"
                >
                  <StatusBadge
                    :tone="REFUND_TONES[r.state]"
                    :label="t(`box-office.order.refund.state.${r.state}`)"
                  />
                </RecordListItem>
              </RecordList>
            </PageSection>
            <PageSection
              v-if="d.cancellations.length"
              :title="t('box-office.order.cancellations')"
            >
              <RecordList>
                <RecordListItem
                  v-for="c in d.cancellations"
                  :key="c.id"
                  :name="t(c.kind === 'exchange' ? 'box-office.order.cancellation.exchange-title' : 'box-office.order.cancellation.title', { count: c.lineCount, when: dateTime(c.at) })"
                  :description="[c.reason, c.note, c.by ? t('box-office.order.cancellation.by', { name: c.by }) : null, c.refunded ? t('box-office.order.cancellation.refunded') : null].filter(Boolean).join(', ')"
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
        :has-buyer="!!d.buyer"
        @cancelled="refresh()"
      />
      <BoxOfficeAssignDialog
        v-model:open="assigning"
        :order-id="d.id"
        :reference="d.reference"
        :paid="d.state === 'confirmed'"
        @assigned="refresh()"
      />
      <BoxOfficeCompDialog
        v-model:open="comping"
        :order-id="d.id"
        :count="cancellable.length"
        :needs-approval="d.compNeedsApproval"
        @done="refresh()"
      />
      <BoxOfficeExchangeDialog
        v-model:open="exchanging"
        :order-id="d.id"
        :reference="d.reference"
        :currency="d.currency"
        :lines="exchangeable"
        :performance="d.performance"
        @exchanged="refresh()"
      />
    </template>
  </DataBoundary>
</template>
