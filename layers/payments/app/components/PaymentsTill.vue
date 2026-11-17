<!-- The till (Box office specification, part 4): Payments' desk component. Each module with something
     to sell at the desk draws its own panel (payments.desk-basket); the till shows what the filled
     panels add up to, makes the one payment for the total in the seller's open session and takes it
     by any way to pay on offer at the desk. Another way is offered only once an attempt is known to
     have failed, so nobody pays twice. After a sale the panels are emptied; after a cancel they keep
     what was in them, so the seller can try again. A host narrows the till to some modules' panels
     (Box office's Sell shows only its own); live mode draws the panels as tabs over the one basket,
     each with its larger live panel where its module has one. Coming to the till opens the seller's
     session if none is open, at the place this device used last; a strip above the panels says which
     session sales go into and lets the seller move it. -->
<script setup lang="ts">
import type { YourSession } from '../../shared/sessions'

interface Panel { id: string, module: string, label: string, tab: string, icon: string | null, panel: string, livePanel: string | null }
interface Summary { basket: string, lines: { label: string, amountMinor: number }[], amountMinor: number }
interface Offer { providerAccountId: string, provider: string, label: string, method: string, mode: 'live' | 'test', readers?: { id: string, label: string }[] }
type Next = { kind: 'redirect' | 'handoff', url: string } | { kind: 'client-secret', secret: string } | { kind: 'waiting-for-reader' | 'none' }
interface Status { state: string, amountMinor: number, currency: string, paidMinor: number, waiting: boolean }

const props = defineProps<{
  /** The modules whose panels to show; every panel the seller may use when absent. */
  modules?: string[]
  /** Live mode: the panels as tabs, drawn larger. */
  live?: boolean
}>()
const emit = defineEmits<{ settled: [{ intentId: string, amountMinor: number }] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const router = useRouter()
const { currency, money, toMinor } = await useMoney()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()

const { data: session, refresh: refreshSession } = await useAPI<YourSession>('/api/payments/session', { key: 'payments:session' })
const open = computed(() => session.value?.session?.state === 'open')
const { time } = useDates()

// The place this device last sold at, where its next session opens.
const SPACE_KEY = 'payments.till.space'
function deviceSpace(): string | null {
  try { return localStorage.getItem(SPACE_KEY) || null }
  catch { return null }
}
const opening = ref(false)
const openingRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
/** Opens the seller's session if none is open. True once one is. */
async function ensureSession(): Promise<boolean> {
  if (open.value) return true
  opening.value = true
  openingRefusal.value = null
  try {
    await $api('/api/payments/till/session', { method: 'POST', body: { spaceId: deviceSpace() } })
    await refreshSession()
  }
  catch (e) {
    openingRefusal.value = toRefusal(e)
  }
  finally {
    opening.value = false
  }
  return open.value
}
onMounted(() => { if (session.value?.mayOpen && !open.value) void ensureSession() })

async function move(spaceId: string | null) {
  const current = session.value?.session
  if (!current) return
  try { localStorage.setItem(SPACE_KEY, spaceId ?? '') }
  catch { /* storage refused: the next session opens at the default */ }
  try {
    await $api(`/api/payments/sessions/${current.id}` as string, { method: 'PATCH', body: { spaceId } })
    await refreshSession()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const { data: loaded, status, error, refresh } = await useAPI<{ panels: Panel[] }>('/api/payments/till/panels', { key: 'payments:till-panels', immediate: open.value })
watch(open, (now) => { if (now && !loaded.value) refresh() })

// A panel component no layer supplies is left out rather than breaking the till.
const panels = computed(() => (loaded.value?.panels ?? []).flatMap((p) => {
  if (props.modules && !props.modules.includes(p.module)) return []
  const component = resolveComponent((props.live && p.livePanel) || p.panel)
  return typeof component === 'string' ? [] : [{ ...p, component }]
}))

const inputs = reactive<Record<string, unknown>>({})
const filled = computed(() => panels.value.filter(p => inputs[p.id] !== null && inputs[p.id] !== undefined).map(p => ({ basket: p.id, input: inputs[p.id] })))

// What the filled panels add up to, asked again shortly after the seller stops changing them.
const summary = ref<{ panels: Summary[], amountMinor: number } | null>(null)
const summing = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let asked = 0
async function sum() {
  const ask = ++asked
  if (!filled.value.length) {
    summary.value = null
    refusal.value = null
    return
  }
  summing.value = true
  try {
    const answer = await $api<{ panels: Summary[], amountMinor: number }>('/api/payments/till/summary', { method: 'POST', body: { panels: filled.value } })
    if (ask !== asked) return
    summary.value = answer
    refusal.value = null
  }
  catch (e) {
    if (ask !== asked) return
    summary.value = null
    refusal.value = toRefusal(e)
  }
  finally {
    if (ask === asked) summing.value = false
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch(filled, () => {
  clearTimeout(timer)
  timer = setTimeout(sum, 300) // not-policy: a pause in typing before the total is asked again
}, { deep: true })
const summaryOf = (id: string) => summary.value?.panels.find(p => p.basket === id) ?? null

// In live mode each panel is a tab once there are two; its badge counts the lines it adds to the sale.
const tabbed = computed(() => props.live && panels.value.length > 1)
const tab = ref<string | undefined>(undefined)
const tabs = computed(() => panels.value.map((p) => {
  const lines = summaryOf(p.id)?.lines.length ?? 0
  return { value: p.id, label: t(p.tab), icon: p.icon ?? undefined, badge: lines ? String(lines) : undefined, slot: 'panel' as const }
}))

// The payment being taken: one intent for the total, paid by one way after another until it settles.
const sale = ref<{ intentId: string, amountMinor: number, key: string } | null>(null)
const saleKey = ref(crypto.randomUUID())
const taking = ref(false)
const payment = ref<Status | null>(null)
const result = ref<{ kind: 'declined' | 'waiting' | 'handoff', url?: string } | null>(null)
const changeMinor = ref(0)
const offered = ref<{ methods: Offer[] } | null>(null)

async function takePayment() {
  if (!summary.value || summary.value.amountMinor <= 0) return
  taking.value = true
  refusal.value = null
  try {
    // A session that closed itself while the till sat quiet is opened again, and the sale made in it.
    const sell = () => $api<{ intentId: string, amountMinor: number }>('/api/payments/till/sale', { method: 'POST', body: { panels: filled.value }, headers: { 'idempotency-key': saleKey.value } })
    let made: Awaited<ReturnType<typeof sell>>
    try {
      made = await sell()
    }
    catch (e) {
      if (toRefusal(e).code !== 'payments.session.none') throw e
      await refreshSession()
      if (!await ensureSession()) throw e
      saleKey.value = crypto.randomUUID()
      made = await sell()
    }
    sale.value = { ...made, key: crypto.randomUUID() }
    payment.value = { state: 'open', amountMinor: made.amountMinor, currency: currency.value, paidMinor: 0, waiting: false }
    result.value = null
    if (!offered.value) offered.value = await $api<{ methods: Offer[] }>('/api/payments/till/methods')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    taking.value = false
  }
}

const due = computed(() => (payment.value ? payment.value.amountMinor - payment.value.paidMinor : 0))
const methods = computed(() => offered.value?.methods ?? [])
const choice = ref<string | undefined>(undefined)
const chosen = computed(() => methods.value.find(m => key(m) === choice.value))
const key = (m: Offer) => `${m.providerAccountId}:${m.method}`
const tendered = ref<number | undefined>(undefined)
const readerId = ref<string | undefined>(undefined)
// Part of what is due, taken by this way of paying; empty takes it all. The rest is then taken another way.
const part = ref<number | undefined>(undefined)
const partMinor = computed(() => (part.value === undefined || part.value === null ? undefined : toMinor(part.value)))
const partTooMuch = computed(() => partMinor.value !== undefined && (partMinor.value <= 0 || partMinor.value > due.value))
const taken = computed(() => partMinor.value ?? due.value)
watch(chosen, (m) => {
  tendered.value = undefined
  readerId.value = m?.readers?.length === 1 ? m.readers[0]!.id : undefined
})
const methodLabel = (m: Offer) => (m.method === 'cash' ? t('payments.screens.methods.cash') : `${t(`payments.screens.methods.${m.method}`)} · ${m.label}`)

async function check() {
  if (!sale.value) return
  const before = payment.value?.paidMinor ?? 0
  const now = await $api<Status>(`/api/payments/intents/${sale.value.intentId}` as string)
  payment.value = now
  if (now.state === 'succeeded') return done()
  if (now.state === 'unfulfilled') return undone()
  if (now.state !== 'open') return ended()
  if (now.paidMinor > before) return partTaken(now.paidMinor - before)
  if (!now.waiting && result.value?.kind === 'waiting') result.value = { kind: 'declined' }
}

let polling: ReturnType<typeof setInterval> | undefined
function poll() {
  clearInterval(polling)
  polling = setInterval(() => { check().catch(() => {}) }, 3000) // not-policy: how often the screen asks while a reader is busy
}
function stopPolling() {
  clearInterval(polling)
  polling = undefined
}
onBeforeUnmount(() => {
  stopPolling()
  clearTimeout(timer)
})

async function pay(succeeded = true) {
  const m = chosen.value
  if (!sale.value || !m) return
  taking.value = true
  refusal.value = null
  result.value = null
  try {
    if (m.method === 'cash' || m.method.endsWith('_attested')) {
      const tenderedMinor = m.method === 'cash' && tendered.value !== undefined ? toMinor(tendered.value) : undefined
      const answer = await $api<{ settled: boolean, unfulfilled: boolean, changeMinor: number }>(`/api/payments/intents/${sale.value.intentId}/attest` as string, {
        method: 'POST',
        body: { providerAccountId: m.providerAccountId, method: m.method, amountMinor: partMinor.value, tenderedMinor, succeeded: m.method === 'cash' ? undefined : succeeded },
        headers: { 'idempotency-key': sale.value.key },
      })
      sale.value.key = crypto.randomUUID()
      changeMinor.value = answer.changeMinor
      if (answer.unfulfilled) return undone()
      if (!succeeded) result.value = { kind: 'declined' }
      await check()
    }
    else {
      const started = await $api<{ next: Next, state: string, settled: boolean, unfulfilled: boolean }>(`/api/payments/intents/${sale.value.intentId}/start` as string, {
        method: 'POST',
        // The SumUp app sends the seller back to this screen, which picks the sale up again (resume).
        body: { providerAccountId: m.providerAccountId, method: m.method, readerId: readerId.value, amountMinor: partMinor.value, returnTo: route.path },
        headers: { 'idempotency-key': sale.value.key },
      })
      sale.value.key = crypto.randomUUID()
      if (started.unfulfilled) return undone()
      if (started.settled) return check()
      if (started.state === 'failed') {
        result.value = { kind: 'declined' }
        return
      }
      if (started.next.kind === 'handoff' || started.next.kind === 'redirect') result.value = { kind: 'handoff', url: started.next.url }
      else result.value = { kind: 'waiting' }
      poll()
    }
  }
  catch (e) {
    sale.value.key = crypto.randomUUID()
    refusal.value = toRefusal(e)
  }
  finally {
    taking.value = false
  }
}

// A part is paid and the rest is still due: say what was taken and any change, and start the next way afresh.
function partTaken(amountMinor: number) {
  const change = changeMinor.value
  stopPolling()
  result.value = null
  toast.add({ title: t('payments.screens.till.part-paid', { amount: money(amountMinor), due: money(due.value) }), description: change > 0 ? t('payments.screens.till.change', { amount: money(change) }) : undefined, color: 'success' })
  changeMinor.value = 0
  choice.value = undefined
  part.value = undefined
}
const paidInPart = computed(() => (payment.value?.paidMinor ?? 0) > 0)

// Back from a hand-off to another app, such as SumUp's: the page has loaded afresh, so the sale is
// picked up again from its payment, and what the app said is shown. The address is then cleaned so a
// reload does not repeat it.
async function resume(intentId: string, said: string) {
  try {
    const now = await $api<Status>(`/api/payments/intents/${intentId}` as string)
    sale.value = { intentId, amountMinor: now.amountMinor, key: crypto.randomUUID() }
    payment.value = now
    if (now.state === 'open' && !offered.value) offered.value = await $api<{ methods: Offer[] }>('/api/payments/till/methods')
    if (now.state === 'succeeded') return done()
    if (now.state === 'unfulfilled') return undone()
    if (now.state !== 'open') return ended()
    if (now.waiting) {
      result.value = { kind: 'waiting' }
      poll()
    }
    else if (said === 'succeeded') toast.add({ title: t('payments.screens.session.handoff.succeeded'), description: t('payments.screens.till.due', { amount: money(now.amountMinor - now.paidMinor) }), color: 'success' })
    else if (said === 'failed') result.value = { kind: 'declined' }
    else toast.add({ title: t('payments.screens.session.handoff.unknown'), description: t('payments.screens.session.handoff.unknown-help'), color: 'warning' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
onMounted(() => {
  const { intent, result: said, attempt, ...rest } = route.query
  if (typeof intent !== 'string' || typeof said !== 'string' || !attempt) return
  void router.replace({ query: rest })
  if (session.value?.session) void resume(intent, said)
})

const waiting = computed(() => result.value?.kind === 'waiting' || result.value?.kind === 'handoff' || !!payment.value?.waiting)

async function cancel() {
  if (!sale.value) return
  const ok = await confirm({
    verb: t('payments.screens.till.cancel-verb'),
    thing: money(sale.value.amountMinor),
    consequence: waiting.value ? t('payments.screens.till.cancel-waiting') : t('payments.screens.till.cancel-consequence'),
    button: t('payments.screens.till.cancel-button'),
  })
  if (!ok) return
  taking.value = true
  try {
    await $api(`/api/payments/intents/${sale.value.intentId}/cancel` as string, { method: 'POST', body: {} })
    ended()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    taking.value = false
  }
}

// Paid in part, then the customer left (BO-35): the sale ends, and each payment goes back the way it
// came. The seller hands back cash, and refunds on a standalone machine or the SumUp app, before
// confirming; a card the site took goes back by itself.
async function giveBack() {
  if (!sale.value) return
  const ok = await confirm({
    verb: t('payments.screens.till.give-back-verb'),
    thing: money(payment.value?.paidMinor ?? 0),
    consequence: t('payments.screens.till.give-back-consequence'),
    button: t('payments.screens.till.give-back-button'),
  })
  if (!ok) return
  taking.value = true
  try {
    const out = await $api<{ handedBack: { amountMinor: number }[], sent: { amountMinor: number }[], unconfirmed: number }>(`/api/payments/intents/${sale.value.intentId}/give-back` as string, { method: 'POST', body: {} })
    const sum = (list: { amountMinor: number }[]) => list.reduce((total, l) => total + l.amountMinor, 0)
    const said = [
      out.handedBack.length ? t('payments.screens.till.given-back-by-hand', { amount: money(sum(out.handedBack)) }) : '',
      out.sent.length ? t('payments.screens.till.given-back-to-card', { amount: money(sum(out.sent)) }) : '',
      out.unconfirmed ? t('payments.screens.till.given-back-unconfirmed') : '',
    ].filter(Boolean).join(' ')
    reset()
    for (const p of panels.value) inputs[p.id] = null
    toast.add({ title: t('payments.screens.till.given-back'), description: said || undefined, color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    taking.value = false
  }
}

function reset() {
  stopPolling()
  sale.value = null
  payment.value = null
  result.value = null
  choice.value = undefined
  part.value = undefined
  saleKey.value = crypto.randomUUID()
}
function done() {
  const finished = sale.value!
  const change = changeMinor.value
  reset()
  for (const p of panels.value) inputs[p.id] = null
  toast.add({ title: t('payments.screens.till.paid', { amount: money(finished.amountMinor) }), description: change > 0 ? t('payments.screens.till.change', { amount: money(change) }) : undefined, color: 'success' })
  emit('settled', { intentId: finished.intentId, amountMinor: finished.amountMinor })
}
function undone() {
  reset()
  for (const p of panels.value) inputs[p.id] = null
  toast.add({ title: t('payments.screens.till.unfulfilled'), description: t('payments.screens.till.unfulfilled-help'), color: 'error' })
}
function ended() {
  reset()
  toast.add({ title: t('payments.screens.till.cancelled'), color: 'neutral' })
  sum()
}
</script>

<template>
  <div>
    <EmptyState
      v-if="!open"
      :title="opening ? t('payments.screens.till.opening') : t('payments.screens.till.no-session')"
      :description="opening ? undefined : t('payments.screens.till.no-session-help')"
      icon="i-lucide-calculator"
    >
      <template
        v-if="!opening"
        #actions
      >
        <RefusalNotice :refusal="openingRefusal" />
        <UButton
          :label="t('payments.screens.till.open-session')"
          @click="ensureSession"
        />
      </template>
    </EmptyState>

    <DataBoundary
      v-else
      :data="loaded"
      :status="status"
      :error="error"
      :skeleton-rows="3"
      @retry="refresh()"
    >
      <template #default>
        <!-- Which session sales go into, and where it is; moving it is remembered on this device. -->
        <div
          v-if="session?.session"
          class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted"
        >
          <span>{{ t('payments.screens.till.session-since', { time: time(session.session.openedAt) }) }}</span>
          <PaymentsSessionPlace
            :model-value="session.session.spaceId"
            :disabled="!!sale"
            @update:model-value="move"
          />
          <ULink
            to="/console/payments/sessions"
            class="underline"
          >
            {{ t('payments.screens.till.your-session') }}
          </ULink>
        </div>
        <EmptyState
          v-if="!panels.length"
          :title="t('payments.screens.till.no-panels')"
          :description="t('payments.screens.till.no-panels-help')"
          icon="i-lucide-shopping-basket"
        />
        <div
          v-else
          class="grid gap-6"
          :class="live ? 'md:grid-cols-[minmax(0,1fr)_22rem] text-lg' : 'lg:grid-cols-[minmax(0,1fr)_20rem]'"
        >
          <!-- Every panel stays mounted, so a tab keeps what was put in it while another is shown. -->
          <UTabs
            v-if="tabbed"
            v-model="tab"
            :items="tabs"
            :unmount-on-hide="false"
            size="xl"
            variant="link"
          >
            <template #panel="{ item }">
              <component
                :is="panels.find(p => p.id === item.value)!.component"
                v-model="inputs[item.value]"
                class="pt-4"
                :locked="!!sale"
                :summary="summaryOf(item.value)"
              />
            </template>
          </UTabs>
          <div
            v-else
            class="space-y-6"
          >
            <PageSection
              v-for="p in panels"
              :key="p.id"
              :title="t(p.label)"
            >
              <component
                :is="p.component"
                v-model="inputs[p.id]"
                :locked="!!sale"
                :summary="summaryOf(p.id)"
              />
            </PageSection>
          </div>

          <aside
            class="space-y-4 rounded-lg border border-default p-4"
            :class="live ? 'md:sticky md:top-16 md:self-start' : 'lg:sticky lg:top-4 lg:self-start'"
            :aria-label="t('payments.screens.till.total-label')"
          >
            <ul
              v-if="summary?.panels.length"
              class="space-y-1"
            >
              <template
                v-for="s in summary.panels"
                :key="s.basket"
              >
                <li
                  v-for="(line, i) in s.lines"
                  :key="`${s.basket}-${i}`"
                  class="flex justify-between gap-3 text-sm"
                >
                  <span>{{ line.label }}</span>
                  <span>{{ money(line.amountMinor) }}</span>
                </li>
              </template>
            </ul>
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('payments.screens.till.nothing-yet') }}
            </p>
            <p
              class="flex justify-between text-lg font-semibold"
              aria-live="polite"
            >
              <span>{{ t('payments.screens.till.total') }}</span>
              <span>{{ money(summary?.amountMinor ?? 0) }}</span>
            </p>

            <RefusalNotice :refusal="refusal" />

            <UButton
              v-if="!sale"
              block
              size="lg"
              icon="i-lucide-banknote"
              :loading="taking"
              :disabled="summing || !summary || summary.amountMinor <= 0"
              :label="t('payments.screens.till.take', { amount: money(summary?.amountMinor ?? 0) })"
              @click="takePayment"
            />

            <div
              v-else
              class="space-y-4"
            >
              <p class="font-medium">
                {{ t('payments.screens.till.due', { amount: money(due) }) }}
              </p>
              <p
                v-if="paidInPart"
                class="text-sm text-muted"
              >
                {{ t('payments.screens.till.paid-so-far', { amount: money(payment?.paidMinor ?? 0) }) }}
              </p>

              <UAlert
                v-if="result?.kind === 'declined'"
                color="warning"
                icon="i-lucide-circle-x"
                :title="t('payments.screens.till.declined')"
                :description="t('payments.screens.till.declined-help')"
              />
              <UAlert
                v-else-if="waiting"
                color="info"
                icon="i-lucide-loader"
                :title="t('payments.screens.till.waiting')"
                :description="t('payments.screens.till.waiting-help')"
              >
                <template #actions>
                  <UButton
                    v-if="result?.kind === 'handoff'"
                    :to="result.url"
                    external
                    size="sm"
                    :label="t('payments.screens.test.open')"
                  />
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    :label="t('payments.screens.test.check')"
                    @click="check()"
                  />
                </template>
              </UAlert>

              <template v-if="!waiting">
                <p
                  v-if="!methods.length"
                  class="text-sm text-muted"
                >
                  {{ t('payments.screens.till.no-methods') }}
                </p>
                <URadioGroup
                  v-else
                  v-model="choice"
                  :size="live ? 'xl' : undefined"
                  :variant="live ? 'card' : undefined"
                  :legend="t('payments.screens.till.how')"
                  :items="methods.map(m => ({ value: key(m), label: methodLabel(m), description: m.mode === 'test' ? t('payments.screens.providers.test-mode') : undefined }))"
                />

                <UFormField
                  v-if="chosen"
                  :label="t('payments.screens.till.part')"
                  :hint="t('payments.screens.optional')"
                  :help="t('payments.screens.till.part-help', { amount: money(due) })"
                  :error="partTooMuch ? t('payments.screens.till.part-too-much', { amount: money(due) }) : undefined"
                >
                  <UInputNumber
                    v-model="part"
                    :min="0"
                    :step="0.01"
                    :format-options="{ style: 'currency', currency }"
                  />
                </UFormField>
                <UFormField
                  v-if="chosen?.method === 'cash'"
                  :label="t('payments.screens.till.tendered')"
                  :hint="t('payments.screens.optional')"
                  :help="t('payments.screens.till.tendered-help')"
                >
                  <UInputNumber
                    v-model="tendered"
                    :min="0"
                    :step="0.01"
                    :format-options="{ style: 'currency', currency }"
                  />
                </UFormField>
                <UFormField
                  v-if="chosen?.method === 'card_reader'"
                  :label="t('payments.screens.test.reader')"
                  required
                >
                  <USelect
                    v-model="readerId"
                    :items="(chosen.readers ?? []).map(r => ({ value: r.id, label: r.label }))"
                  />
                </UFormField>

                <div
                  v-if="chosen"
                  class="flex flex-wrap gap-2"
                >
                  <UButton
                    :loading="taking"
                    :disabled="partTooMuch || (chosen.method === 'card_reader' && !readerId)"
                    :label="chosen.method.endsWith('_attested') ? t('payments.screens.till.approved', { amount: money(taken) }) : chosen.method === 'cash' ? t('payments.screens.till.cash-taken', { amount: money(taken) }) : t('payments.screens.till.start', { amount: money(taken) })"
                    @click="pay()"
                  />
                  <UButton
                    v-if="chosen.method.endsWith('_attested')"
                    color="neutral"
                    variant="outline"
                    :disabled="taking"
                    :label="t('payments.screens.till.machine-declined')"
                    @click="pay(false)"
                  />
                </div>
              </template>

              <!-- Money taken for part of the sale stays with it: the rest is taken, or what was taken is given back. -->
              <UButton
                v-if="paidInPart"
                color="neutral"
                variant="ghost"
                :disabled="taking || waiting"
                :label="t('payments.screens.till.give-back-button')"
                @click="giveBack"
              />
              <UButton
                v-else
                color="neutral"
                variant="ghost"
                :disabled="taking"
                :label="t('payments.screens.till.cancel-button')"
                @click="cancel"
              />
            </div>
          </aside>
        </div>
      </template>
    </DataBoundary>
  </div>
</template>
