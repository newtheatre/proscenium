<!-- Box office's panel in the till (R-3, R-4, R-5, BO-30, BO-54): tickets for somebody at the desk, a
     reservation found by its reference or desk code, changed to who actually came, and paid for, or
     the difference on an exchange to dearer tickets, sent here from the booking's page. The panel
     only says what is in it; the till adds it up and takes the payment. -->
<script setup lang="ts">
import type { Buyer } from '../components/BoxOfficeBuyerPicker.vue'

interface PerformanceRow { bandId: string, band: string, ticketTypeId: string, ticketType: string, amountMinor: number, free: number, reference?: { label: string, field?: string, shape: string } }
interface Performance { performanceId: string, title: string, startsAt: number, state: string, currency: string | null, rows: PerformanceRow[] }
interface OrderLine { id: string, performanceId: string, bandId: string, ticketTypeId: string, ticketType: string, amountMinor: number, admittedAt: number | null }
interface PendingExchange { orderId: string, reference: string, performanceId: string, lines: { lineId: string, bandId: string, ticketTypeId: string }[], expectedDifferenceMinor: number }
interface Order { orderId: string, reference: string, state: 'reserved' | 'awaiting_payment' | 'confirmed' | 'cancelled', currency: string, totalMinor: number, amountDueMinor: number, intentId: string | null, buyer: string | null, performance: { title: string, startsAt: number } | null, lines: OrderLine[] }

const props = defineProps<{ modelValue: unknown, locked: boolean, summary: { lines: { label: string, amountMinor: number }[], amountMinor: number } | null }>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

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

const mode = ref<'sell' | 'collect'>('sell')
const modes = computed(() => [{ label: t('box-office.screens.panel.sell'), value: 'sell' }, { label: t('box-office.screens.panel.collect'), value: 'collect' }])
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
watch(performanceId, () => {
  quantities.value = {}
  references.value = {}
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
const addChoices = computed(() => orderRows.value.map(r => ({ value: keyOf(r), label: t('box-office.screens.panel.row', { band: r.band, type: r.ticketType, price: money(r.amountMinor) }) })))

function tell(value: unknown) {
  lastSaid = JSON.stringify(value)
  emit('update:modelValue', value)
}
function say() {
  if (exchange.value) {
    const { reference: _, ...body } = exchange.value
    tell({ exchange: body })
    return
  }
  if (mode.value === 'sell') {
    const lines = (performance.value?.rows ?? []).filter(r => (quantities.value[keyOf(r)] ?? 0) > 0).map((r) => {
      const quantity = quantities.value[keyOf(r)]!
      // The buyer's references, when the seller typed one for every ticket; otherwise the seller has checked by hand.
      const typed = (references.value[keyOf(r)] ?? []).slice(0, quantity).map(x => x.trim())
      return { bandId: r.bandId, ticketTypeId: r.ticketTypeId, quantity, ...(r.reference && typed.filter(Boolean).length === quantity ? { references: typed } : {}) }
    })
    tell(lines.length && performance.value ? { performanceId: performance.value.performanceId, lines, admit: admit.value, ...sendTo.value, ...(promo.value ? { promoCode: promo.value.code } : {}) } : null)
  }
  else {
    tell(order.value?.state === 'reserved' && order.value.totalMinor > 0 ? { orderId: order.value.orderId, expectedTotalMinor: order.value.totalMinor, admit: admit.value } : null)
  }
}
watch([mode, admit, quantities, references, order, exchange, sendTo, promo], say, { deep: true })
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
  mode.value = 'sell'
  performanceId.value = value.performanceId
  await nextTick() // the performance's watcher empties the quantities first
  const lines = value.lines as { bandId: string, ticketTypeId: string, quantity: number, references?: string[] }[]
  quantities.value = Object.fromEntries(lines.map(l => [keyOf(l), l.quantity]))
  references.value = Object.fromEntries(lines.filter(l => l.references).map(l => [keyOf(l), l.references!]))
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
  // Emptied by the till rather than by this panel saying there is nothing.
  const fromTill = lastSaid !== 'null'
  lastSaid = 'null'
  if (exchange.value) dropExchange()
  if (Object.keys(quantities.value).length) quantities.value = {}
  if (Object.keys(references.value).length) references.value = {}
  // The next buyer never sees who the last one was, nor uses their code.
  buyer.value = undefined
  dropCode()
  if (!order.value || mode.value !== 'collect') return
  // After a sale the booking is found again, to show it paid; the receipt's Clear puts it away.
  if (fromTill && !wasLocked) clear()
  else if (order.value.state === 'reserved') void find(order.value.reference)
})

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
    v-if="exchange"
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
    <UTabs
      v-model="mode"
      :items="modes"
      :content="false"
      :aria-label="t('box-office.screens.panel.mode')"
    />
    <RefusalNotice :refusal="refusal" />

    <template v-if="mode === 'sell'">
      <p
        v-if="!performances.length"
        class="text-sm text-muted"
      >
        {{ t('box-office.screens.panel.no-performances') }}
      </p>
      <template v-else>
        <UFormField :label="t('box-office.screens.panel.performance')">
          <USelect
            v-model="performanceId"
            :items="choices"
            :disabled="locked"
          />
        </UFormField>
        <p
          v-if="performance?.state === 'paused'"
          class="text-sm text-muted"
        >
          {{ t('box-office.screens.panel.paused') }}
        </p>
        <template v-else>
          <UFormField
            v-for="row in performance?.rows ?? []"
            :key="keyOf(row)"
            :label="promoPrice(row) !== undefined ? t('box-office.screens.panel.row-with-code', { band: row.band, type: row.ticketType, price: money(promoPrice(row)!), was: money(row.amountMinor) }) : t('box-office.screens.panel.row', { band: row.band, type: row.ticketType, price: money(row.amountMinor) })"
            :help="t('box-office.screens.panel.left', { count: row.free })"
          >
            <div class="space-y-2">
              <!-- Shown as 0 rather than empty: from an empty box, the first + would only fill in 0 (T1). -->
              <UInputNumber
                :model-value="quantities[keyOf(row)] ?? 0"
                :min="0"
                :max="row.free"
                :disabled="locked"
                @update:model-value="setQuantity(row, $event)"
              />
              <template v-if="row.reference && (quantities[keyOf(row)] ?? 0) > 0">
                <UInput
                  v-for="n in quantities[keyOf(row)]"
                  :key="n"
                  :model-value="references[keyOf(row)]?.[n - 1] ?? ''"
                  :aria-label="t('box-office.screens.panel.reference', { label: row.reference.field ?? row.reference.label, n })"
                  :placeholder="t('box-office.screens.panel.reference-placeholder', { n })"
                  :disabled="locked"
                  autocomplete="off"
                  maxlength="64"
                  class="block w-64"
                  @update:model-value="setReference(row, n - 1, String($event))"
                />
                <p class="text-xs text-muted">
                  {{ t('box-office.screens.panel.reference-help') }}
                </p>
              </template>
            </div>
          </UFormField>
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
      </template>
    </template>

    <template v-else>
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
        <p class="font-medium">
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
