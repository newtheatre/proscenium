<!-- Box office's panel in the till (R-3, R-4, R-5, BO-30, BO-54): tickets for somebody at the desk, a
     reservation found by its reference or desk code, changed to who actually came, and paid for, or
     the difference on an exchange to dearer tickets, sent here from the booking's page. The panel
     only says what is in it; the till adds it up and takes the payment. -->
<script setup lang="ts">
import type { Buyer } from '../components/BoxOfficeBuyerPicker.vue'

interface PerformanceRow { bandId: string, band: string, ticketTypeId: string, ticketType: string, amountMinor: number, free: number }
interface Performance { performanceId: string, title: string, startsAt: number, state: string, currency: string | null, rows: PerformanceRow[] }
interface OrderLine { id: string, performanceId: string, bandId: string, ticketTypeId: string, ticketType: string, amountMinor: number, admittedAt: number | null }
interface PendingExchange { orderId: string, reference: string, performanceId: string, lines: { lineId: string, bandId: string, ticketTypeId: string }[], expectedDifferenceMinor: number }
interface Order { orderId: string, reference: string, state: 'reserved' | 'awaiting_payment' | 'confirmed' | 'cancelled', currency: string, totalMinor: number, amountDueMinor: number, lines: OrderLine[] }

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

const { data } = await useAPI<{ performances: Performance[], searchPeople: boolean }>('/api/box-office/desk/performances', { key: 'box-office:desk-performances', default: () => ({ performances: [], searchPeople: false }) })
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
watch(performanceId, () => { quantities.value = {} })

// Collecting: one order, found by what the buyer shows.
const query = ref('')
const order = ref<Order | null>(null)
const searched = ref(false)
const busy = ref(false)
const adding = ref<string | undefined>(undefined)
const orderRows = computed(() => performances.value.find(p => p.performanceId === order.value?.lines[0]?.performanceId)?.rows ?? [])
const typesFor = (line: OrderLine) => orderRows.value.filter(r => r.bandId === line.bandId).map(r => ({ value: r.ticketTypeId, label: `${r.ticketType}, ${money(r.amountMinor)}` }))
const addChoices = computed(() => orderRows.value.map(r => ({ value: keyOf(r), label: t('box-office.screens.panel.row', { band: r.band, type: r.ticketType, price: money(r.amountMinor) }) })))

function say() {
  if (exchange.value) {
    const { reference: _, ...body } = exchange.value
    emit('update:modelValue', { exchange: body })
    return
  }
  if (mode.value === 'sell') {
    const lines = (performance.value?.rows ?? []).filter(r => (quantities.value[keyOf(r)] ?? 0) > 0).map(r => ({ bandId: r.bandId, ticketTypeId: r.ticketTypeId, quantity: quantities.value[keyOf(r)]! }))
    emit('update:modelValue', lines.length && performance.value ? { performanceId: performance.value.performanceId, lines, admit: admit.value, ...sendTo.value } : null)
  }
  else {
    emit('update:modelValue', order.value?.state === 'reserved' && order.value.totalMinor > 0 ? { orderId: order.value.orderId, expectedTotalMinor: order.value.totalMinor, admit: admit.value } : null)
  }
}
watch([mode, admit, quantities, order, exchange, sendTo], say, { deep: true })
onMounted(() => {
  if (exchange.value) say()
})

// The till empties every panel after a sale.
watch(() => props.modelValue, (now) => {
  if (now !== null && now !== undefined) return
  if (exchange.value) dropExchange()
  if (Object.keys(quantities.value).length) quantities.value = {}
  // The next buyer never sees who the last one was.
  buyer.value = undefined
  if (order.value && mode.value === 'collect' && order.value.state === 'reserved') void find(order.value.reference)
})

async function find(text = query.value) {
  if (!text.trim()) return
  busy.value = true
  refusal.value = null
  try {
    const found = await $api<{ orders: Order[] }>('/api/box-office/desk/orders', { query: { q: text } })
    order.value = found.orders[0] ?? null
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
function addTicket() {
  const row = orderRows.value.find(r => keyOf(r) === adding.value)
  if (row) void amend({ add: [{ bandId: row.bandId, ticketTypeId: row.ticketTypeId, quantity: 1 }] })
}
function clear() {
  order.value = null
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
            :label="t('box-office.screens.panel.row', { band: row.band, type: row.ticketType, price: money(row.amountMinor) })"
            :help="t('box-office.screens.panel.left', { count: row.free })"
          >
            <UInputNumber
              v-model="quantities[keyOf(row)]"
              :min="0"
              :max="row.free"
              :disabled="locked"
            />
          </UFormField>
        </template>
      </template>
    </template>

    <template v-else>
      <UForm
        :state="{ query }"
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
      <p
        v-if="searched && !order"
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
        <ul class="space-y-2">
          <li
            v-for="(line, i) in order.lines"
            :key="line.id"
            class="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <USelect
              v-if="order.state === 'reserved' && typesFor(line).length > 1"
              :model-value="line.ticketTypeId"
              :items="typesFor(line)"
              :disabled="locked || busy"
              :aria-label="t('box-office.screens.panel.type', { n: i + 1 })"
              @update:model-value="(value: string) => amend({ retype: [{ lineId: line.id, ticketTypeId: value }] })"
            />
            <span v-else>{{ line.ticketType }}</span>
            <span class="flex items-center gap-2">
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
        <p class="font-medium">
          {{ order.amountDueMinor > 0 ? t('box-office.screens.panel.due', { amount: money(order.amountDueMinor, order.currency) }) : t('box-office.screens.panel.nothing-due') }}
        </p>
        <UButton
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
      :help="data?.searchPeople ? t('box-office.screens.panel.buyer.help-search') : t('box-office.screens.panel.email-help')"
      name="buyer"
    >
      <BoxOfficeBuyerPicker
        v-model="buyer"
        :search-people="data?.searchPeople ?? false"
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
