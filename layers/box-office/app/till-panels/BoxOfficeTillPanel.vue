<!-- Box office's panel in the till (R-3, R-4, R-5, BO-30, BO-54): tickets for somebody at the desk, a
     reservation found by its reference or desk code, changed to who actually came, and paid for, or
     the difference on an exchange to dearer tickets, sent here from the booking's page. The panel
     only says what is in it; the till adds it up and takes the payment. -->
<script setup lang="ts">
import type { Buyer } from '../components/BoxOfficeBuyerPicker.vue'
import type { Holder } from '../components/BoxOfficeHolderPicker.vue'

interface PerformanceRow { bandId: string, band: string, ticketTypeId: string, ticketType: string, amountMinor: number, free: number, reference?: { label: string, field?: string, shape: string }, holder?: true }
interface Performance { performanceId: string, title: string, startsAt: number, state: string, currency: string | null, rows: PerformanceRow[] }
interface OrderLine { id: string, performanceId: string, bandId: string, ticketTypeId: string, ticketType: string, amountMinor: number, admittedAt: number | null }
interface PendingExchange { orderId: string, reference: string, performanceId: string, lines: { lineId: string, bandId: string, ticketTypeId: string }[], expectedDifferenceMinor: number }
interface Order { orderId: string, reference: string, state: 'reserved' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'expired', released: boolean, currency: string, totalMinor: number, amountDueMinor: number, intentId: string | null, buyer: string | null, performance: { title: string, startsAt: number } | null, lines: OrderLine[] }

/** `settled`: the till payment just taken that this panel sold something in, until the next customer. */
const props = defineProps<{ modelValue: unknown, locked: boolean, summary: { lines: { label: string, amountMinor: number }[], amountMinor: number } | null, settled?: string | null }>()
/** One line on the till's receipt; `more` and `fewer` draw its stepper there. */
interface ReceiptLine { key: string, label: string, detail?: string, quantity: number, amountMinor: number, more: () => void, fewer: () => void }
const emit = defineEmits<{
  'update:modelValue': [unknown]
  /** The tickets for the till's receipt, with their steppers, and what was last added (till proposal, 17 November 2026). */
  'receipt': [{ lines: ReceiptLine[], added: { label: string, undo: () => void } | null } | null]
}>()

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime } = useDates()
const { toRefusal } = useRefusal()
const route = useRoute()
const router = useRouter()

// An exchange to dearer tickets, from the booking's page: the difference is all this panel holds.
function readExchange(value: unknown): PendingExchange | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as PendingExchange
    return parsed && typeof parsed.orderId === 'string' && Array.isArray(parsed.lines) && Number.isInteger(parsed.expectedDifferenceMinor) ? parsed : null
  }
  catch {
    return null
  }
}
const exchange = ref<PendingExchange | null>(readExchange(route.query.exchange))
function dropExchange() {
  exchange.value = null
  const { exchange: _, ...query } = route.query
  void router.replace({ query })
}

const { data } = await useAPI<{ performances: Performance[], emailDomains: string[] }>('/api/box-office/desk/performances', { key: 'box-office:desk-performances', default: () => ({ performances: [], emailDomains: [] }) })
const performances = computed(() => data.value?.performances ?? [])

// One search box finds a booking to collect; with none found, the panel sells walk-up tickets.
const mode = ref<'sell' | 'collect'>('sell')
const admit = ref(false)
// Who the tickets are emailed to, if the buyer wants them: a person picked by name or a typed
// address. Optional; the till shows nothing back about them.
const buyer = ref<Buyer | undefined>()
const sendTo = computed(() => !buyer.value ? {} : 'accountId' in buyer.value ? { accountId: buyer.value.accountId } : { email: buyer.value.email })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

// Selling: how many of each kind of ticket for one performance.
const performanceId = ref<string | undefined>(performances.value[0]?.performanceId)
const performance = computed(() => performances.value.find(p => p.performanceId === performanceId.value))
const choices = computed(() => performances.value.map(p => ({ value: p.performanceId, label: `${p.title}, ${dateTime(p.startsAt)}` })))
const quantities = ref<Record<string, number>>({})
const keyOf = (row: { bandId: string, ticketTypeId: string }) => `${row.bandId} ${row.ticketTypeId}`
// The counter (till proposal): a tile for each kind of ticket in each part of the house, adding
// one a press; the receipt's steppers take them off again.
const bands = computed(() => {
  const out: { bandId: string, band: string, free: number, rows: PerformanceRow[] }[] = []
  for (const row of performance.value?.rows ?? []) {
    const band = out.find(b => b.bandId === row.bandId)
    if (band) band.rows.push(row)
    else out.push({ bandId: row.bandId, band: row.band, free: row.free, rows: [row] })
  }
  return out
})
// The seats left in a part of the house, less those already in this sale.
const takenIn = (bandId: string) => (performance.value?.rows ?? []).filter(r => r.bandId === bandId).reduce((n, r) => n + (quantities.value[keyOf(r)] ?? 0), 0)
const naming = computed(() => (performance.value?.rows ?? []).filter(r => r.holder && (quantities.value[keyOf(r)] ?? 0) > 0))
const lastAdded = ref<string | null>(null)
function addOne(row: PerformanceRow) {
  if (takenIn(row.bandId) >= row.free) return
  setQuantity(row, (quantities.value[keyOf(row)] ?? 0) + 1)
  lastAdded.value = keyOf(row)
}
function takeOne(row: PerformanceRow) {
  const n = (quantities.value[keyOf(row)] ?? 0) - 1
  setQuantity(row, n)
  // Who the last ticket was for goes with it.
  for (const list of [holders.value[keyOf(row)], references.value[keyOf(row)]]) if (list && list.length > n) list.splice(Math.max(n, 0))
  if (n <= 0 && lastAdded.value === keyOf(row)) lastAdded.value = null
}
// A performance whose production has one price throughout sells in one section, which is not named.
const oneSection = (id: string | undefined) => {
  const rows = performances.value.find(p => p.performanceId === id)?.rows ?? []
  return rows.length > 0 && rows.every(r => r.bandId === rows[0]!.bandId)
}
const rowLabel = (row: PerformanceRow) => (bands.value.length > 1 ? t('box-office.screens.panel.sold.line', { band: row.band, type: row.ticketType }) : row.ticketType)

function setQuantity(row: PerformanceRow, value: number | null | undefined) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  const { [keyOf(row)]: _, ...others } = quantities.value
  quantities.value = n > 0 ? { ...others, [keyOf(row)]: n } : others
}
// A member's references, typed for each ticket of a member price.
const references = ref<Record<string, string[]>>({})
function setReference(row: PerformanceRow, n: number, value: string) {
  const list = [...(references.value[keyOf(row)] ?? [])]
  list[n] = value
  references.value = { ...references.value, [keyOf(row)]: list }
}
// Who each ticket of a member or holder price is for (Matt, 17 November): named by card or by name.
const holders = ref<Record<string, (Holder | undefined)[]>>({})
function setHolder(row: PerformanceRow, n: number, value: Holder | undefined) {
  const list = [...(holders.value[keyOf(row)] ?? [])]
  list[n] = value
  holders.value = { ...holders.value, [keyOf(row)]: list }
}
/** How many of a row's tickets still need their holder named, or a reference typed. */
function unnamed(row: PerformanceRow): number {
  if (!row.holder) return 0
  const quantity = quantities.value[keyOf(row)] ?? 0
  return Array.from({ length: quantity }, (_, n) => !holders.value[keyOf(row)]?.[n] && !references.value[keyOf(row)]?.[n]?.trim()).filter(Boolean).length
}
watch(performanceId, () => {
  quantities.value = {}
  references.value = {}
  holders.value = {}
  dropCode()
})

// A promo code the buyer gives (BO-17): tried first, so the seller sees what it does before taking
// payment; the sale applies it again, to the dearest tickets first, as booking online does.
interface Promo { code: string, effect: 'percent_off' | 'amount_off' | 'set_price', value: number, maxPerOrder: number | null, prices: { bandId: string, ticketTypeId: string, amountMinor: number }[] }
const codeOpen = ref(false)
const codeTyped = ref('')
const promo = ref<Promo | null>(null)
const codeRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const codeBusy = ref(false)
const promoPrice = (row: PerformanceRow) => promo.value?.prices.find(p => p.bandId === row.bandId && p.ticketTypeId === row.ticketTypeId)?.amountMinor
function promoWords(p: Promo) {
  const what = p.effect === 'percent_off' ? t('box-office.codes.words.percent_off', { percent: p.value / 100 }) : t(`box-office.codes.words.${p.effect}`, { amount: money(p.value) })
  return p.maxPerOrder ? `${what} · ${t('box-office.codes.words.per-order', { count: p.maxPerOrder })}` : what
}
async function tryCode() {
  if (!codeTyped.value.trim() || !performanceId.value) return
  codeBusy.value = true
  codeRefusal.value = null
  try {
    promo.value = await $api<Promo>(`/api/box-office/book/performances/${encodeURIComponent(performanceId.value)}/promo` as string, { query: { code: codeTyped.value.trim() } })
    codeTyped.value = ''
  }
  catch (e) {
    promo.value = null
    codeRefusal.value = toRefusal(e)
  }
  finally {
    codeBusy.value = false
  }
}
function dropCode() {
  promo.value = null
  codeTyped.value = ''
  codeRefusal.value = null
  codeOpen.value = false
}

// Collecting: one order, found by what the buyer shows.
const query = ref('')
const order = ref<Order | null>(null)
// Several bookings found under one name: the seller picks the right one.
const matches = ref<Order[]>([])
const about = (o: Order) => [o.buyer, o.performance ? `${o.performance.title}, ${dateTime(o.performance.startsAt)}` : null].filter(Boolean).join(' · ')
const searched = ref(false)
const busy = ref(false)
const adding = ref<string | undefined>(undefined)
const orderRows = computed(() => performances.value.find(p => p.performanceId === order.value?.lines[0]?.performanceId)?.rows ?? [])
// The price shows under each choice in the list; the box shows the name, with the line's price beside it.
const typesFor = (line: OrderLine) => orderRows.value.filter(r => r.bandId === line.bandId).map(r => ({ value: r.ticketTypeId, label: r.ticketType, description: money(r.amountMinor) }))
const addChoices = computed(() => orderRows.value.map(r => ({ value: keyOf(r), label: oneSection(order.value?.lines[0]?.performanceId)
  ? t('box-office.screens.panel.row-whole', { type: r.ticketType, price: money(r.amountMinor) })
  : t('box-office.screens.panel.row', { band: r.band, type: r.ticketType, price: money(r.amountMinor) }) })))

function tell(value: unknown) {
  lastSaid = JSON.stringify(value)
  emit('update:modelValue', value)
}
// The receipt's lines for a walk-up sale: one for each kind of ticket in the sale, priced as the
// code would price them, dearest first up to its limit, so the total shows before the server's.
function sendReceipt(rows: PerformanceRow[]) {
  if (exchange.value || mode.value !== 'sell' || !performance.value) return emit('receipt', null)
  const each = rows.flatMap(r => Array.from({ length: quantities.value[keyOf(r)] ?? 0 }, () => ({ key: keyOf(r), full: r.amountMinor, with: promoPrice(r) })))
  const discounted = new Map<string, number>()
  each.filter(e => e.with !== undefined).sort((a, b) => b.full - a.full).slice(0, promo.value?.maxPerOrder ?? Infinity)
    .forEach(e => discounted.set(e.key, (discounted.get(e.key) ?? 0) + (e.full - e.with!)))
  const show = performance.value
  const detail = t('box-office.screens.panel.receipt-detail', { title: show.title, when: dateTime(show.startsAt) })
  const added = rows.find(r => keyOf(r) === lastAdded.value)
  emit('receipt', {
    lines: rows.map((r) => {
      const quantity = quantities.value[keyOf(r)]!
      return { key: keyOf(r), label: rowLabel(r), detail, quantity, amountMinor: r.amountMinor * quantity - (discounted.get(keyOf(r)) ?? 0), more: () => addOne(r), fewer: () => takeOne(r) }
    }),
    added: added ? { label: rowLabel(added), undo: () => takeOne(added) } : null,
  })
}
function say() {
  if (exchange.value) {
    const { reference: _, ...body } = exchange.value
    tell({ exchange: body })
    emit('receipt', null)
    return
  }
  if (mode.value === 'sell') {
    // A member or holder ticket joins the sale once every ticket is named, by a holder or a typed reference.
    const lines = (performance.value?.rows ?? []).filter(r => (quantities.value[keyOf(r)] ?? 0) > 0 && !unnamed(r)).map((r) => {
      const quantity = quantities.value[keyOf(r)]!
      if (!r.holder) return { bandId: r.bandId, ticketTypeId: r.ticketTypeId, quantity }
      const typed = Array.from({ length: quantity }, (_, n) => references.value[keyOf(r)]?.[n]?.trim() ?? '')
      const named = Array.from({ length: quantity }, (_, n) => (typed[n] ? '' : holders.value[keyOf(r)]?.[n]?.accountId ?? ''))
      return { bandId: r.bandId, ticketTypeId: r.ticketTypeId, quantity, ...(typed.some(Boolean) ? { references: typed } : {}), ...(named.some(Boolean) ? { holders: named } : {}) }
    })
    tell(lines.length && performance.value ? { performanceId: performance.value.performanceId, lines, admit: admit.value, ...sendTo.value, ...(promo.value ? { promoCode: promo.value.code } : {}) } : null)
    sendReceipt((performance.value?.rows ?? []).filter(r => (quantities.value[keyOf(r)] ?? 0) > 0 && !unnamed(r)))
  }
  else {
    emit('receipt', null)
    tell(order.value?.state === 'reserved' && order.value.totalMinor > 0 ? { orderId: order.value.orderId, expectedTotalMinor: order.value.totalMinor, admit: admit.value } : null)
  }
}
watch([mode, admit, quantities, references, holders, order, exchange, sendTo, promo, lastAdded], say, { deep: true })
// A booking found, or several to pick from, is what the panel shows; with none, it sells walk-up tickets.
watch([order, matches], () => {
  mode.value = order.value || matches.value.length ? 'collect' : 'sell'
})
onMounted(() => {
  if (exchange.value) say()
  // Sent from the door with a reservation to pay for (`?collect=<reference>`): it is found at once.
  const collect = route.query.collect
  if (typeof collect === 'string' && collect.trim()) {
    mode.value = 'collect'
    query.value = collect
    void find(collect)
    const { collect: _, ...rest } = route.query
    void router.replace({ query: rest })
  }
})

// What the panel last said, so a value the till hands back can be told from its own.
let lastSaid = 'null'
// The till hands back what a sale was for when it picks a payment up after a reload: the
// performance and how many of each ticket are shown again, as they were.
async function restore(value: { performanceId?: unknown, lines?: unknown, admit?: unknown, email?: unknown, promoCode?: unknown }) {
  if (typeof value.performanceId !== 'string' || !Array.isArray(value.lines)) return
  order.value = null
  matches.value = []
  mode.value = 'sell'
  performanceId.value = value.performanceId
  await nextTick() // the performance's watcher empties the quantities first
  const lines = value.lines as { bandId: string, ticketTypeId: string, quantity: number, references?: string[], holders?: string[] }[]
  quantities.value = Object.fromEntries(lines.map(l => [keyOf(l), l.quantity]))
  references.value = Object.fromEntries(lines.filter(l => l.references).map(l => [keyOf(l), l.references!]))
  // Who each ticket was for is kept by account; their names were on the screen before the reload.
  holders.value = Object.fromEntries(lines.filter(l => l.holders).map(l => [keyOf(l), l.holders!.map(id => (id ? { accountId: id, label: t('box-office.screens.panel.holder.restored'), byHand: false } : undefined))]))
  admit.value = value.admit === true
  if (typeof value.email === 'string') buyer.value = { email: value.email }
  if (typeof value.promoCode === 'string') {
    codeTyped.value = value.promoCode
    await tryCode()
  }
}

// The till empties every panel after a sale, and when the seller clears the sale.
watch(() => [props.modelValue, props.locked] as const, ([now], [, wasLocked]) => {
  if (now !== null && now !== undefined) {
    if (typeof now === 'object' && JSON.stringify(now) !== lastSaid) void restore(now as Record<string, unknown>)
    return
  }
  // A holder ticket still to be named, such as a wheelchair space, is not in the sale yet, so the
  // panel says there is nothing; its own word coming back leaves the ticket waiting to be named.
  if (lastSaid === 'null' && naming.value.some(r => unnamed(r) > 0)) return
  // Emptied by the till rather than by this panel saying there is nothing.
  const fromTill = lastSaid !== 'null'
  lastSaid = 'null'
  if (exchange.value) dropExchange()
  if (Object.keys(quantities.value).length) quantities.value = {}
  if (Object.keys(references.value).length) references.value = {}
  if (Object.keys(holders.value).length) holders.value = {}
  // The next buyer never sees who the last one was, nor uses their code.
  buyer.value = undefined
  dropCode()
  if (!order.value || mode.value !== 'collect') return
  // After a sale the booking is found again, to show it paid; the receipt's Clear puts it away.
  if (fromTill && !wasLocked) clear()
  else if (order.value.state === 'reserved') void find(order.value.reference)
})

// After the sale (till proposal): what was made, with its reference and tickets, so the seller can
// email them, admit the buyer, or open the booking, until the till moves on to the next customer.
interface Sold { orderId: string, reference: string, buyer: string | null, performance: { id: string, title: string, startsAt: number } | null, lines: { id: string, band: string | null, ticketType: string, amountMinor: number, admitted: boolean }[] }
const sold = ref<Sold[]>([])
const soldRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const emailTo = ref<Record<string, Buyer | undefined>>({})
const soldBusy = ref<string | null>(null)
async function loadSold(intent: string) {
  try {
    sold.value = (await $api<{ orders: Sold[] }>('/api/box-office/desk/sold', { query: { intent } })).orders
  }
  catch (e) {
    soldRefusal.value = toRefusal(e)
  }
}
watch(() => props.settled, (intent) => {
  sold.value = []
  emailTo.value = {}
  soldRefusal.value = null
  if (intent) void loadSold(intent)
}, { immediate: true })
const waitingIn = (o: Sold) => o.lines.filter(l => !l.admitted).length
async function soldAction(o: Sold, fn: () => Promise<unknown>) {
  soldBusy.value = o.orderId
  soldRefusal.value = null
  try {
    await fn()
    if (props.settled) await loadSold(props.settled)
  }
  catch (e) {
    soldRefusal.value = toRefusal(e)
  }
  finally {
    soldBusy.value = null
  }
}
function emailSold(o: Sold) {
  const to = emailTo.value[o.orderId]
  if (!to) return
  void soldAction(o, () => $api(`/api/box-office/desk/orders/${o.orderId}/send` as string, { method: 'POST', body: 'accountId' in to ? { accountId: to.accountId } : { email: to.email } }))
}
function admitSold(o: Sold) {
  if (!o.performance) return
  void soldAction(o, () => $api(`/api/box-office/performances/${o.performance!.id}/door/admit` as string, { method: 'POST', body: { orderId: o.orderId, count: waitingIn(o), deviceLabel: 'Desk' } }))
}

async function find(text = query.value) {
  if (!text.trim()) return
  busy.value = true
  refusal.value = null
  try {
    const found = await $api<{ orders: Order[] }>('/api/box-office/desk/orders', { query: { q: text } })
    matches.value = found.orders.length > 1 ? found.orders : []
    order.value = found.orders.length === 1 ? found.orders[0]! : null
    searched.value = true
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

// A reservation released unpaid, whose buyer has come after all: reserved again if seats are free.
async function reinstate() {
  if (!order.value) return
  const reference = order.value.reference
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/box-office/orders/${order.value.orderId}/reinstate` as string, { method: 'POST', body: {} })
    await find(reference)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

async function amend(body: Record<string, unknown>) {
  if (!order.value) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/box-office/orders/${order.value.orderId}/amend` as string, { method: 'POST', body })
    await find(order.value.reference)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
// A payment started for the booking and never finished, such as at another till or before a reload:
// cancelling it puts the reservation back, ready to be paid for here. A payment this till is taking
// is cancelled from the till itself.
async function cancelPending() {
  const o = order.value
  if (!o?.intentId) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/payments/intents/${o.intentId}/cancel` as string, { method: 'POST', body: {} })
    await find(o.reference)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
// Splitting: one of a group pays for their own tickets now, and the rest stay reserved.
const splitting = ref(false)
const picked = ref<string[]>([])
const rest = ref<{ reference: string, amountMinor: number, currency: string } | null>(null)
function togglePicked(lineId: string, on: boolean | 'indeterminate') {
  picked.value = on === true ? [...picked.value, lineId] : picked.value.filter(id => id !== lineId)
}
async function split() {
  const from = order.value
  if (!from || !picked.value.length) return
  busy.value = true
  refusal.value = null
  try {
    const made = await $api<{ reference: string, remainingMinor: number }>(`/api/box-office/orders/${from.orderId}/split` as string, { method: 'POST', body: { lineIds: picked.value } })
    rest.value = { reference: from.reference, amountMinor: made.remainingMinor, currency: from.currency }
    splitting.value = false
    picked.value = []
    await find(made.reference)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}

function addTicket() {
  const row = orderRows.value.find(r => keyOf(r) === adding.value)
  if (row) void amend({ add: [{ bandId: row.bandId, ticketTypeId: row.ticketTypeId, quantity: 1 }] })
}
function clear() {
  splitting.value = false
  picked.value = []
  rest.value = null
  order.value = null
  matches.value = []
  searched.value = false
  query.value = ''
}
</script>

<template>
  <div
    v-if="settled && sold.length"
    class="space-y-4"
  >
    <RefusalNotice :refusal="soldRefusal" />
    <div
      v-for="o in sold"
      :key="o.orderId"
      class="space-y-3 rounded-lg border border-default p-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-lg font-semibold">
          {{ t('box-office.screens.panel.order', { reference: o.reference }) }}
        </h3>
        <StatusBadge
          tone="success"
          :label="t('box-office.screens.panel.states.confirmed')"
        />
      </div>
      <p
        v-if="o.performance"
        class="text-sm text-muted"
      >
        {{ o.performance.title }}, {{ dateTime(o.performance.startsAt) }}
      </p>
      <ul
        class="divide-y divide-default"
        :aria-label="t('box-office.screens.panel.sold.tickets')"
      >
        <li
          v-for="line in o.lines"
          :key="line.id"
          class="flex items-center justify-between gap-2 py-1.5"
        >
          <span>{{ line.band && !oneSection(o.performance?.id) ? t('box-office.screens.panel.sold.line', { band: line.band, type: line.ticketType }) : line.ticketType }}</span>
          <span class="flex shrink-0 items-center gap-2">
            <UBadge
              v-if="line.admitted"
              color="success"
              variant="subtle"
              :label="t('box-office.screens.panel.admitted')"
            />
            <span class="tabular-nums">{{ money(line.amountMinor) }}</span>
          </span>
        </li>
      </ul>
      <p
        v-if="o.buyer"
        class="flex items-center gap-2 text-sm"
      >
        <UIcon
          name="i-lucide-mail-check"
          class="size-4 text-success"
        />{{ t('box-office.screens.panel.sold.emailed', { name: o.buyer }) }}
      </p>
      <UFormField
        v-else
        :label="t('box-office.screens.panel.sold.email')"
        :help="t('box-office.screens.panel.sold.email-help')"
      >
        <div class="flex flex-wrap gap-2">
          <BoxOfficeBuyerPicker
            v-model="emailTo[o.orderId]"
            :domains="data?.emailDomains ?? []"
            :disabled="soldBusy === o.orderId"
            class="min-w-64 flex-1"
          />
          <UButton
            icon="i-lucide-send"
            :label="t('box-office.screens.panel.sold.send')"
            :loading="soldBusy === o.orderId"
            :disabled="!emailTo[o.orderId]"
            @click="emailSold(o)"
          />
        </div>
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="waitingIn(o) && o.performance"
          icon="i-lucide-door-open"
          color="neutral"
          variant="outline"
          :label="t('box-office.screens.panel.sold.admit', { count: waitingIn(o) })"
          :loading="soldBusy === o.orderId"
          @click="admitSold(o)"
        />
        <UButton
          :to="`/console/box-office/orders/${o.orderId}/print`"
          target="_blank"
          icon="i-lucide-printer"
          color="neutral"
          variant="outline"
          :label="t('box-office.screens.panel.sold.print')"
        />
        <UButton
          :to="`/console/box-office/orders/${o.orderId}`"
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          :label="t('box-office.screens.panel.sold.open')"
        />
      </div>
    </div>
  </div>
  <div
    v-else-if="exchange"
    class="space-y-3 rounded-lg border border-default p-4"
  >
    <h3 class="font-medium">
      {{ t('box-office.screens.panel.exchange.title', { reference: exchange.reference }) }}
    </h3>
    <p class="text-sm">
      {{ t('box-office.screens.panel.exchange.description', { count: exchange.lines.length }) }}
    </p>
    <p class="font-medium">
      {{ t('box-office.screens.panel.due', { amount: money(exchange.expectedDifferenceMinor) }) }}
    </p>
    <UButton
      :label="t('box-office.screens.panel.exchange.cancel')"
      color="neutral"
      variant="link"
      :disabled="locked"
      @click="dropExchange"
    />
  </div>
  <div
    v-else
    class="space-y-4"
  >
    <RefusalNotice :refusal="refusal" />

    <UForm
      :state="{ query }"
      novalidate
      @submit="find()"
    >
      <!-- The buttons sit on the box's own row, so the help line under it cannot push them out of line. -->
      <UFormField
        :label="t('box-office.screens.panel.find-label')"
        :help="t('box-office.screens.panel.find-help')"
      >
        <div class="flex gap-2">
          <UInput
            v-model="query"
            class="flex-1"
            :disabled="locked"
            autocomplete="off"
          />
          <UButton
            type="submit"
            :label="t('box-office.screens.panel.find')"
            icon="i-lucide-search"
            :loading="busy"
            :disabled="locked || !query.trim()"
          />
          <CodeScanButton
            icon-only
            :disabled="locked"
            @scanned="(code: string) => { query = code; find() }"
          />
        </div>
      </UFormField>
    </UForm>
    <ul
      v-if="!order && matches.length"
      class="space-y-2"
      :aria-label="t('box-office.screens.panel.matches')"
    >
      <li
        v-for="m in matches"
        :key="m.orderId"
      >
        <UButton
          color="neutral"
          variant="outline"
          class="w-full justify-between"
          :disabled="locked"
          @click="order = m; matches = []"
        >
          <span class="flex flex-col items-start text-left">
            <span class="font-medium">{{ t('box-office.screens.panel.order', { reference: m.reference }) }}</span>
            <span class="text-sm text-muted">{{ about(m) }}</span>
          </span>
          <span class="text-sm">{{ t(`box-office.screens.panel.states.${m.state}`) }}</span>
        </UButton>
      </li>
    </ul>
    <p
      v-if="searched && !order && !matches.length"
      class="text-sm text-muted"
    >
      {{ t('box-office.screens.panel.none') }}
    </p>
    <div
      v-if="order"
      class="space-y-3 rounded-lg border border-default p-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-medium">
          {{ t('box-office.screens.panel.order', { reference: order.reference }) }}
        </h3>
        <StatusBadge
          :tone="order.state === 'confirmed' ? 'success' : order.state === 'cancelled' ? 'neutral' : 'warning'"
          :label="t(`box-office.screens.panel.states.${order.state}`)"
        />
      </div>
      <p
        v-if="about(order)"
        class="text-sm text-muted"
      >
        {{ about(order) }}
      </p>
      <ul class="space-y-2">
        <li
          v-for="(line, i) in order.lines"
          :key="line.id"
          class="flex items-center justify-between gap-2 text-sm"
        >
          <UCheckbox
            v-if="splitting"
            :model-value="picked.includes(line.id)"
            :label="`${line.ticketType}, ${money(line.amountMinor, order.currency)}`"
            :disabled="locked || busy"
            @update:model-value="(on: boolean | 'indeterminate') => togglePicked(line.id, on)"
          />
          <USelect
            v-else-if="order.state === 'reserved' && typesFor(line).length > 1"
            :model-value="line.ticketTypeId"
            :items="typesFor(line)"
            class="min-w-0 flex-1"
            :disabled="locked || busy"
            :aria-label="t('box-office.screens.panel.type', { n: i + 1 })"
            @update:model-value="(value: string) => amend({ retype: [{ lineId: line.id, ticketTypeId: value }] })"
          />
          <span v-else>{{ line.ticketType }}</span>
          <span class="flex shrink-0 items-center gap-2">
            <span v-if="line.admittedAt">{{ t('box-office.screens.panel.admitted') }}</span>
            <span>{{ money(line.amountMinor, order.currency) }}</span>
            <IconButton
              v-if="order.state === 'reserved' && order.lines.length > 1"
              icon="i-lucide-x"
              size="xs"
              :label="t('box-office.screens.panel.remove', { type: line.ticketType })"
              :disabled="locked || busy"
              @click="amend({ remove: [line.id] })"
            />
          </span>
        </li>
      </ul>
      <UAlert
        v-if="order.released"
        color="warning"
        variant="subtle"
        icon="i-lucide-clock-alert"
        :title="t('box-office.screens.panel.released.title')"
        :description="t('box-office.screens.panel.released.description')"
        :actions="locked ? [] : [{ label: t('box-office.screens.panel.released.seat'), color: 'primary', loading: busy, onClick: () => { void reinstate() } }]"
      />
      <UAlert
        v-if="order.state === 'awaiting_payment' && order.intentId && !locked"
        color="warning"
        variant="subtle"
        icon="i-lucide-hourglass"
        :title="t('box-office.screens.panel.pending.title')"
        :description="t('box-office.screens.panel.pending.description')"
        :actions="[{ label: t('box-office.screens.panel.pending.cancel'), color: 'neutral', variant: 'outline', loading: busy, onClick: () => { void cancelPending() } }]"
      />
      <div
        v-if="order.state === 'reserved' && addChoices.length"
        class="flex items-end gap-2"
      >
        <UFormField
          :label="t('box-office.screens.panel.add')"
          class="grow"
        >
          <USelect
            v-model="adding"
            :items="addChoices"
            :placeholder="t('box-office.screens.panel.add-placeholder')"
            :disabled="locked || busy"
          />
        </UFormField>
        <UButton
          :label="t('box-office.screens.panel.add-button')"
          color="neutral"
          variant="outline"
          :disabled="locked || busy || !adding"
          @click="addTicket"
        />
      </div>
      <div
        v-if="order.state === 'reserved' && order.lines.length > 1"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-if="!splitting"
          icon="i-lucide-split"
          color="neutral"
          variant="outline"
          :label="t('box-office.screens.panel.split')"
          :disabled="locked || busy"
          @click="splitting = true"
        />
        <template v-else>
          <UButton
            :label="t('box-office.screens.panel.split-confirm', { count: picked.length })"
            :disabled="locked || busy || !picked.length || picked.length === order.lines.length"
            :loading="busy"
            @click="split"
          />
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('core.form.cancel')"
            @click="splitting = false; picked = []"
          />
        </template>
      </div>
      <p
        v-if="splitting"
        class="text-sm text-muted"
      >
        {{ t('box-office.screens.panel.split-help') }}
      </p>
      <UAlert
        v-if="rest"
        color="info"
        variant="subtle"
        icon="i-lucide-split"
        :description="t('box-office.screens.panel.split-rest', { reference: rest.reference, amount: money(rest.amountMinor, rest.currency) })"
      />
      <p
        v-if="!order.released"
        class="font-medium"
      >
        {{ order.amountDueMinor > 0 ? t('box-office.screens.panel.due', { amount: money(order.amountDueMinor, order.currency) }) : t('box-office.screens.panel.nothing-due') }}
      </p>
      <!-- While the booking is in the sale, the receipt's Clear puts it away; one Clear at a time. -->
      <UButton
        v-if="modelValue === null || modelValue === undefined"
        :label="t('box-office.screens.panel.clear')"
        color="neutral"
        variant="link"
        :disabled="locked"
        @click="clear"
      />
    </div>
    <!-- Walk-up: tickets for tonight's show, one tile a kind of ticket; the receipt holds how many. -->
    <template v-if="!order && !matches.length">
      <p
        v-if="!performances.length"
        class="text-sm text-muted"
      >
        {{ t('box-office.screens.panel.no-performances') }}
      </p>
      <section
        v-else-if="performance"
        class="space-y-4"
        :aria-labelledby="`walk-up-${performance.performanceId}`"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3
            :id="`walk-up-${performance.performanceId}`"
            class="font-medium"
          >
            {{ t('box-office.screens.panel.walk-up', { title: performance.title, when: dateTime(performance.startsAt) }) }}
          </h3>
          <UBadge
            v-if="bands.length === 1"
            color="neutral"
            variant="outline"
            :label="t('box-office.screens.panel.left', { count: bands[0]!.free })"
          />
        </div>
        <p
          v-if="performance.state === 'paused'"
          class="text-sm text-muted"
        >
          {{ t('box-office.screens.panel.paused') }}
        </p>
        <template v-else>
          <div
            v-for="b in bands"
            :key="b.bandId"
            class="space-y-2"
          >
            <div
              v-if="bands.length > 1"
              class="flex items-center justify-between gap-2"
            >
              <h4 class="text-sm font-semibold text-muted">
                {{ b.band }}
              </h4>
              <UBadge
                color="neutral"
                variant="outline"
                :label="t('box-office.screens.panel.left', { count: b.free })"
              />
            </div>
            <div
              class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
              role="group"
              :aria-label="bands.length > 1 ? b.band : undefined"
              :aria-labelledby="bands.length > 1 ? undefined : `walk-up-${performance.performanceId}`"
            >
              <UChip
                v-for="row in b.rows"
                :key="keyOf(row)"
                :show="(quantities[keyOf(row)] ?? 0) > 0"
                :text="quantities[keyOf(row)]"
                size="3xl"
                inset
                :ui="{ root: 'block' }"
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  block
                  class="min-h-16 flex-col items-stretch justify-between gap-1 border-s-4 border-s-primary text-start"
                  :class="(quantities[keyOf(row)] ?? 0) > 0 ? 'bg-elevated' : ''"
                  :disabled="locked || takenIn(b.bandId) >= b.free"
                  @click="addOne(row)"
                >
                  <span class="flex items-start justify-between gap-2 font-medium">
                    <span class="min-w-0 break-words">{{ row.ticketType }}<span
                      v-if="bands.length > 1"
                      class="sr-only"
                    > {{ t('box-office.screens.panel.tile-band', { band: b.band }) }}</span></span>
                    <UIcon
                      v-if="row.holder"
                      name="i-lucide-id-card"
                      class="size-4 shrink-0 text-muted"
                    />
                  </span>
                  <span class="text-sm font-normal text-muted tabular-nums">
                    <template v-if="promoPrice(row) !== undefined">
                      {{ money(promoPrice(row)!) }} <s>{{ money(row.amountMinor) }}</s>
                    </template>
                    <template v-else>{{ money(row.amountMinor) }}</template>
                  </span>
                  <span class="sr-only">{{ t('box-office.screens.panel.tile-add') }}</span>
                </UButton>
              </UChip>
            </div>
          </div>

          <!-- A member or holder ticket names who it is for before it joins the sale. -->
          <div
            v-for="row in naming"
            :key="`holders-${keyOf(row)}`"
            class="space-y-2 rounded-lg border border-default p-3"
          >
            <h4 class="text-sm font-medium">
              {{ t('box-office.screens.panel.holder.heading', { type: bands.length > 1 ? `${row.band}, ${row.ticketType}` : row.ticketType }) }}
            </h4>
            <div
              v-for="n in quantities[keyOf(row)]"
              :key="n"
              class="space-y-1"
            >
              <BoxOfficeHolderPicker
                v-if="!references[keyOf(row)]?.[n - 1]?.trim()"
                :model-value="holders[keyOf(row)]?.[n - 1]"
                :performance-id="performance.performanceId"
                :ticket-type-id="row.ticketTypeId"
                :label="t('box-office.screens.panel.holder.ticket', { n })"
                :disabled="locked"
                @update:model-value="(h: Holder | undefined) => setHolder(row, n - 1, h)"
              />
              <UInput
                v-if="row.reference && !holders[keyOf(row)]?.[n - 1]"
                :model-value="references[keyOf(row)]?.[n - 1] ?? ''"
                :aria-label="t('box-office.screens.panel.reference', { label: row.reference.field ?? row.reference.label, n })"
                :placeholder="t('box-office.screens.panel.holder.or-reference', { label: row.reference.field ?? row.reference.label })"
                :disabled="locked"
                autocomplete="off"
                maxlength="64"
                class="block w-64"
                @update:model-value="setReference(row, n - 1, String($event))"
              />
            </div>
            <p
              v-if="unnamed(row)"
              class="text-sm text-warning"
              role="status"
            >
              {{ t('box-office.screens.panel.holder.needed', { count: unnamed(row) }) }}
            </p>
          </div>
          <div
            v-if="promo"
            class="flex flex-wrap items-center gap-2 rounded-lg bg-elevated px-3 py-2 text-sm"
          >
            <UIcon
              name="i-lucide-ticket-percent"
              class="size-4 shrink-0 text-success"
            />
            <span class="flex-1">{{ t('box-office.screens.panel.code.applied', { code: promo.code, what: promoWords(promo) }) }}</span>
            <UButton
              size="sm"
              color="neutral"
              variant="link"
              :label="t('box-office.screens.panel.code.remove')"
              :disabled="locked"
              @click="dropCode"
            />
          </div>
          <UButton
            v-else-if="!codeOpen"
            icon="i-lucide-ticket-percent"
            color="neutral"
            variant="link"
            :label="t('box-office.screens.panel.code.add')"
            :disabled="locked"
            @click="codeOpen = true"
          />
          <UForm
            v-else
            :state="{ codeTyped }"
            novalidate
            @submit="tryCode"
          >
            <UFormField
              :label="t('box-office.screens.panel.code.label')"
              :error="codeRefusal ? codeRefusal.reason : undefined"
              name="code"
            >
              <div class="flex gap-2">
                <UInput
                  v-model="codeTyped"
                  class="w-48 uppercase"
                  maxlength="40"
                  autocomplete="off"
                  autofocus
                  :disabled="locked"
                />
                <UButton
                  type="submit"
                  color="neutral"
                  variant="outline"
                  :label="t('box-office.screens.panel.code.apply')"
                  :loading="codeBusy"
                  :disabled="locked || !codeTyped.trim()"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  :label="t('core.form.cancel')"
                  @click="dropCode"
                />
              </div>
            </UFormField>
          </UForm>
        </template>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <USelect
            v-if="choices.length > 1"
            v-model="performanceId"
            :items="choices"
            :disabled="locked"
            variant="ghost"
            icon="i-lucide-calendar"
            :aria-label="t('box-office.screens.panel.another')"
            class="min-w-0"
          />
        </div>
      </section>
    </template>

    <UFormField
      v-if="mode === 'sell' && !exchange"
      :label="t('box-office.screens.panel.email')"
      :help="t('box-office.screens.panel.email-help')"
      name="buyer"
    >
      <BoxOfficeBuyerPicker
        v-model="buyer"
        :domains="data?.emailDomains ?? []"
        :disabled="locked"
      />
    </UFormField>
    <UCheckbox
      v-model="admit"
      :label="t('box-office.screens.panel.admit')"
      :description="t('box-office.screens.panel.admit-help')"
      :disabled="locked"
    />
  </div>
</template>
