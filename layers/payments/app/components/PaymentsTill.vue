<!-- The till (Box office specification, part 4): Payments' desk component. Each module with something
     to sell at the desk draws its own panel (payments.desk-basket); the till shows what the filled
     panels add up to, makes the one payment for the total in the seller's open session and takes it
     by any way to pay on offer at the desk. Another way is offered only once an attempt is known to
     have failed, so nobody pays twice. After a sale the panels are emptied; after a cancel they keep
     what was in them, so the seller can try again. A host narrows the till to some modules' panels
     (Box office's Sell shows only its own); live mode draws the panels as tabs over the one basket,
     each with its larger live panel where its module has one. Coming to the till opens the seller's
     session if none is open, at the place this device used last; a strip above the panels says which
     session sales go into and lets the seller move it.

     The sale is one receipt beside the panels (till proposal, 17 November 2026): grouped by panel,
     with the ways to pay on it, so paying is one press and not "take payment" and then a choice. A
     panel may hand the receipt its own lines (the `receipt` event), which then carry steppers and
     appear at once, before the server has answered with the total. On a narrow screen the receipt
     is a sheet, and a bar at the foot says what was last added, with an undo, and takes payment. -->
<script setup lang="ts">
import { createReusableTemplate, useMediaQuery } from '@vueuse/core'
import type { YourSession } from '../../shared/sessions'

/** One line a panel hands the receipt; `more` and `fewer` draw a stepper on it. */
interface ReceiptLine { key: string, label: string, detail?: string, quantity: number, amountMinor: number, more?: () => void, fewer?: () => void }
/** One panel's part of the receipt. */
interface ReceiptGroup { id: string, label: string, icon: string | null, lines: ReceiptLine[], note: PanelReceipt['note'], counted: boolean }
/** What a panel may say about its part of the sale with the `receipt` event. */
interface PanelReceipt {
  lines: ReceiptLine[]
  /** Something about these lines that stays on the receipt, such as the answer to an age check. */
  note?: { text: string, icon?: string, action?: { label: string, run: () => void } } | null
  /** What the seller last added, with the way to take it back. */
  added?: { label: string, undo: () => void } | null
}

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
const { currency, money, toMinor, toMajor } = await useMoney()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()

const { data: session, refresh: refreshSession } = await useAPI<YourSession>('/api/payments/session', { key: 'payments:session' })
const open = computed(() => session.value?.session?.state === 'open')
// The till is usable by someone with a session open or who may open one: the session itself waits
// for the first sale, so coming to the till by mistake leaves nothing behind.
const usable = computed(() => open.value || !!session.value?.mayOpen)
const { time } = useDates()

// The place this device last sold at, where its next session opens.
const SPACE_KEY = 'payments.till.space'
function deviceSpace(): string | null {
  try { return localStorage.getItem(SPACE_KEY) || null }
  catch { return null }
}
const nextPlace = ref<string | null>(null)
// With no place of its own, the device shows where the session would open: the default space, or
// the theatre's only space.
onMounted(() => { nextPlace.value = deviceSpace() ?? session.value?.defaultSpaceId ?? null })
/** Opens the seller's session if none is open, at this device's place. True once one is. */
async function ensureSession(): Promise<boolean> {
  if (open.value) return true
  // The sale goes too, so a sale for tonight's performance opens the session at its space when this
  // device has no place of its own.
  await $api('/api/payments/till/session', { method: 'POST', body: { spaceId: deviceSpace(), panels: filled.value } })
  await refreshSession()
  return open.value
}

async function move(spaceId: string | null) {
  try { localStorage.setItem(SPACE_KEY, spaceId ?? '') }
  catch { /* storage refused: the next session opens at the default */ }
  nextPlace.value = spaceId
  const current = session.value?.session
  if (!current || current.state !== 'open') return
  try {
    await $api(`/api/payments/sessions/${current.id}` as string, { method: 'PATCH', body: { spaceId } })
    await refreshSession()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const { data: loaded, status, error, refresh } = await useAPI<{ panels: Panel[] }>('/api/payments/till/panels', { key: 'payments:till-panels', immediate: usable.value })
watch(usable, (now) => { if (now && !loaded.value) refresh() })

// A panel component no layer supplies is left out rather than breaking the till.
// Panel components are registered globally, so they are looked up on the app: resolveComponent only
// works while the component is being set up, and the panels are worked out again after a refresh.
const { vueApp } = useNuxtApp()
const panels = computed(() => (loaded.value?.panels ?? []).flatMap((p) => {
  if (props.modules && !props.modules.includes(p.module)) return []
  const component = vueApp.component((props.live && p.livePanel) || p.panel)
  return component ? [{ ...p, component }] : []
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
  // While a payment is being taken the panels are locked and the total is the payment's own.
  if (sale.value) {
    stale.value = false
    summing.value = false
    return
  }
  if (!filled.value.length) {
    summary.value = null
    refusal.value = null
    stale.value = false
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
    if (ask === asked) {
      summing.value = false
      stale.value = false
    }
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch(filled, () => {
  stale.value = true
  clearTimeout(timer)
  timer = setTimeout(sum, 300) // not-policy: a pause in typing before the total is asked again
}, { deep: true })
const summaryOf = (id: string) => summary.value?.panels.find(p => p.basket === id) ?? null

// What each panel says of its own lines; a panel that says nothing is shown by the server's summary.
const receipts = reactive<Record<string, PanelReceipt | null>>({})
// The total is the server's. While it is being asked for again, the panels' own lines stand in for
// it where every filled panel gives them, so a press shows at once.
const stale = ref(false)
const estimate = computed(() => {
  let total = 0
  for (const f of filled.value) {
    const own = receipts[f.basket]
    if (!own) return null
    total += own.lines.reduce((sum, l) => sum + l.amountMinor, 0)
  }
  return total
})
const total = computed(() => ((stale.value || summing.value) ? estimate.value : null) ?? summary.value?.amountMinor ?? 0)
const groups = computed<ReceiptGroup[]>(() => panels.value.flatMap((p) => {
  if (inputs[p.id] === null || inputs[p.id] === undefined) return []
  const own = receipts[p.id]
  const lines: ReceiptLine[] = own?.lines.length ? own.lines : (summaryOf(p.id)?.lines ?? []).map((l, i) => ({ key: String(i), label: l.label, quantity: 1, amountMinor: l.amountMinor }))
  return lines.length ? [{ id: p.id, label: t(p.tab), icon: p.icon, lines, note: own?.note ?? null, counted: !!own?.lines.length }] : []
}))
const countOf = (list: ReceiptGroup[]) => list.reduce((sum, g) => sum + (g.counted ? g.lines.reduce((n, l) => n + l.quantity, 0) : g.lines.length), 0)
// While a payment is taken the receipt keeps the lines it is for, as they were when it started.
const held = ref<ReceiptGroup[] | null>(null)
const shown = computed(() => (sale.value ? held.value ?? [] : groups.value))
const count = computed(() => countOf(shown.value))
// The last thing added, by whichever panel said so most recently.
const added = ref<{ label: string, undo: () => void } | null>(null)
function said(id: string, receipt: PanelReceipt | null) {
  receipts[id] = receipt
  if (receipt && 'added' in receipt) added.value = receipt.added ?? null
}
function clearAll() {
  for (const p of panels.value) inputs[p.id] = null
  added.value = null
}

// The receipt is drawn once and shown beside the panels, or in a sheet where there is no room.
const [DefineReceipt, Receipt] = createReusableTemplate()
const wide = useMediaQuery(() => (props.live ? '(min-width: 768px)' : '(min-width: 1024px)'))
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const beside = computed(() => !mounted.value || wide.value)
const sheet = ref(false)
// Payment can start once the server has agreed the total.
const payable = computed(() => !stale.value && !summing.value && !!summary.value && summary.value.amountMinor > 0)

// In live mode each panel is a tab once there are two; its badge counts the lines it adds to the sale.
const tabbed = computed(() => props.live && panels.value.length > 1)
const tab = ref<string | undefined>(undefined)
// The first tab is shown until the seller picks another, so the till never opens on an empty panel.
// Another screen may open the till at a module's panel with `?panel=<module>`, such as the door
// sending a reservation to be paid for.
watch(panels, (now) => {
  if (now.some(p => p.id === tab.value)) return
  const asked = typeof route.query.panel === 'string' ? now.find(p => p.module === route.query.panel) : undefined
  tab.value = (asked ?? now[0])?.id
}, { immediate: true })
const tabs = computed(() => panels.value.map((p) => {
  const own = receipts[p.id]?.lines
  const lines = own?.length ? own.reduce((n, l) => n + l.quantity, 0) : summaryOf(p.id)?.lines.length ?? 0
  return { value: p.id, label: t(p.tab), icon: p.icon ?? undefined, badge: lines ? String(lines) : undefined, slot: 'panel' as const }
}))

// The payment being taken: one intent for the total, paid by one way after another until it settles.
const sale = ref<{ intentId: string, amountMinor: number, key: string } | null>(null)

// What a payment being taken is for, and whether it is being split, kept on this device so a reload
// (or a tablet that went to sleep) picks it up as it was: the lines on the receipt, what was in the
// panels, and the amount to take this way.
const SALE_KEY = 'payments.till.sale'
interface Kept { intentId: string, inputs: Record<string, unknown>, held: ReceiptGroup[], splitting: boolean, part?: number }
function keep() {
  if (!sale.value) return
  const kept: Kept = {
    intentId: sale.value.intentId,
    inputs: Object.fromEntries(panels.value.flatMap(p => (inputs[p.id] === null || inputs[p.id] === undefined ? [] : [[p.id, inputs[p.id]]]))),
    held: held.value ?? [],
    splitting: splitting.value,
    part: part.value ?? undefined,
  }
  try { localStorage.setItem(SALE_KEY, JSON.stringify(kept)) }
  catch { /* storage refused: a reload shows the payment without its lines */ }
}
function kept(intentId: string): Kept | null {
  try {
    const found = JSON.parse(localStorage.getItem(SALE_KEY) ?? 'null') as Kept | null
    return found?.intentId === intentId ? found : null
  }
  catch { return null }
}
function forget() {
  try { localStorage.removeItem(SALE_KEY) }
  catch { /* nothing kept */ }
}
/** A plain copy of the receipt's lines, without the steppers. */
const plain = (list: ReceiptGroup[]): ReceiptGroup[] => list.map(g => ({ ...g, note: g.note ? { text: g.note.text, icon: g.note.icon } : null, lines: g.lines.map(l => ({ key: l.key, label: l.label, detail: l.detail, quantity: l.quantity, amountMinor: l.amountMinor })) }))
const saleKey = ref(crypto.randomUUID())
const taking = ref(false)
const payment = ref<Status | null>(null)
const result = ref<{ kind: 'declined' | 'waiting' | 'handoff', url?: string } | null>(null)
const changeMinor = ref(0)
const offered = ref<{ methods: Offer[] } | null>(null)
// The ways to pay are asked for on arrival so the receipt can offer them at once. Where they cannot
// be had yet, the receipt keeps one "take payment" button, which asks again and says why.
async function loadMethods() {
  if (offered.value || !usable.value) return
  try { offered.value = await $api<{ methods: Offer[] }>('/api/payments/till/methods') }
  catch { /* asked again when a payment is taken, which shows the refusal */ }
}
onMounted(loadMethods)
watch(usable, loadMethods)

async function takePayment() {
  if (!summary.value || summary.value.amountMinor <= 0) return
  taking.value = true
  refusal.value = null
  try {
    // The first sale opens the session. One that closed itself while the till sat quiet is opened
    // again, and the sale made in it.
    if (!open.value && !await ensureSession()) return
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
    held.value = plain(groups.value)
    sale.value = { ...made, key: crypto.randomUUID() }
    payment.value = { state: 'open', amountMinor: made.amountMinor, currency: currency.value, paidMinor: 0, waiting: false }
    result.value = null
    keep()
    if (!offered.value) offered.value = await $api<{ methods: Offer[] }>('/api/payments/till/methods')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    taking.value = false
  }
}

// Before a payment is started, a split is worked out against the receipt's total.
const due = computed(() => (payment.value ? payment.value.amountMinor - payment.value.paidMinor : total.value))
// Card first: it is how nearly every sale is paid.
const RANK = ['card_reader', 'card_attested', 'card_online', 'cash']
const rank = (m: Offer) => (RANK.includes(m.method) ? RANK.indexOf(m.method) : RANK.length)
const methods = computed(() => [...(offered.value?.methods ?? [])].sort((a, b) => rank(a) - rank(b)))
const METHOD_ICONS: Record<string, string> = { card_reader: 'i-lucide-smartphone-nfc', card_attested: 'i-lucide-credit-card', card_online: 'i-lucide-credit-card', cash: 'i-lucide-banknote' }
const methodIcon = (m: Offer) => METHOD_ICONS[m.method] ?? 'i-lucide-wallet'
// Taking the total in parts: the amount is asked for before the way to pay.
const splitting = ref(false)
const paidInPart = computed(() => (payment.value?.paidMinor ?? 0) > 0)
// A way to pay that needs nothing more from the seller starts as soon as it is pressed.
const direct = (m: Offer) => m.method !== 'cash' && !m.method.endsWith('_attested') && (m.method !== 'card_reader' || m.readers?.length === 1)
async function choose(m: Offer) {
  choice.value = key(m)
  await nextTick()
  if (direct(m) && !partTooMuch.value && !partMissing.value) await pay()
}
/** One press from the receipt: makes the sale, then pays this way (the amount first, when splitting). */
async function payWith(m: Offer) {
  if (partMissing.value || partTooMuch.value) {
    sheet.value = !wide.value
    return
  }
  await takePayment()
  if (!sale.value) return
  await choose(m)
}
/** Split, before anything is taken: asks how much to take the first way. Nothing is started yet. */
function startSplit(on: boolean) {
  splitting.value = on
  part.value = undefined
}
const choice = ref<string | undefined>(undefined)
const chosen = computed(() => methods.value.find(m => key(m) === choice.value))
const key = (m: Offer) => `${m.providerAccountId}:${m.method}`
const tendered = ref<number | undefined>(undefined)
const tenderedMinor = computed(() => (tendered.value === undefined || tendered.value === null ? undefined : toMinor(tendered.value)))
// The change, shown while the cash is typed; nothing while the box is empty.
const change = computed(() => (tenderedMinor.value === undefined ? null : tenderedMinor.value - taken.value))
// Quick amounts handed over: the exact sum and the next notes up.
const NOTES = [5, 10, 20, 50] // not-policy: the notes a seller is usually handed, in the major unit
const quickTender = computed(() => NOTES.map(n => toMinor(n)).filter(n => n > taken.value).slice(0, 3))
function tender(minor: number) {
  tendered.value = toMajor(minor)
}
// What an "other" payment was, such as a voucher number or an invoice.
const otherNote = ref('')
const readerId = ref<string | undefined>(undefined)
// Part of what is due, taken by this way of paying; empty takes it all. The rest is then taken another way.
const part = ref<number | undefined>(undefined)
const partMinor = computed(() => (part.value === undefined || part.value === null ? undefined : toMinor(part.value)))
const partTooMuch = computed(() => partMinor.value !== undefined && (partMinor.value <= 0 || partMinor.value > due.value))
const taken = computed(() => partMinor.value ?? due.value)
// The first part of a split needs its amount: a split never quietly takes the whole sum one way.
const partMissing = computed(() => splitting.value && !paidInPart.value && partMinor.value === undefined)
watch([splitting, part], () => keep())
watch(chosen, (m) => {
  tendered.value = undefined
  otherNote.value = ''
  readerId.value = m?.readers?.length === 1 ? m.readers[0]!.id : undefined
})
// A way to pay is named by its method alone ("Card", "Other"); the provider's name is in its tooltip,
// and joins the name only where two providers offer the same method.
const plainName = (m: Offer) => t(`payments.screens.till.method.${m.method}`)
const shared = (m: Offer) => methods.value.filter(o => plainName(o) === plainName(m)).length > 1
const methodLabel = (m: Offer) => (shared(m) ? `${plainName(m)} · ${m.label}` : plainName(m))

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
      const handed = m.method === 'cash' ? tenderedMinor.value : undefined
      const answer = await $api<{ settled: boolean, unfulfilled: boolean, changeMinor: number }>(`/api/payments/intents/${sale.value.intentId}/attest` as string, {
        method: 'POST',
        body: { providerAccountId: m.providerAccountId, method: m.method, amountMinor: partMinor.value, tenderedMinor: handed, note: m.method === 'other_attested' ? otherNote.value.trim() || undefined : undefined, succeeded: m.method === 'cash' ? undefined : succeeded },
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

// Back from a hand-off to another app, such as SumUp's: the page has loaded afresh, so the sale is
// picked up again from its payment, and what the app said is shown. The address is then cleaned so a
// reload does not repeat it.
// The note that a payment was picked up after a reload, taken away once that payment has ended.
let pickedUp: string | number | undefined
async function resume(intentId: string, said: string) {
  try {
    const now = await $api<Status>(`/api/payments/intents/${intentId}` as string)
    // What this device kept of it: its lines, what was in the panels, and any split under way.
    const was = kept(intentId)
    if (was) {
      held.value = was.held
      for (const p of panels.value) {
        if (p.id in was.inputs) inputs[p.id] = was.inputs[p.id]
      }
      splitting.value = was.splitting
      part.value = was.part
    }
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
    else if (said === 'reload') pickedUp = toast.add({ title: t('payments.screens.till.picked-up', { amount: money(now.amountMinor - now.paidMinor) }), description: t('payments.screens.till.picked-up-help'), color: 'warning' }).id
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
  if (typeof intent === 'string' && typeof said === 'string' && attempt) {
    void router.replace({ query: rest })
    if (session.value?.session) void resume(intent, said)
    return
  }
  // A sale left open, such as by reloading the page while taking it, is picked up again so it can be
  // taken or cancelled; otherwise what it holds, such as a reservation, stays waiting for it.
  const left = session.value?.unfinished
  if (left) void resume(left.intentId, 'reload')
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
    afterSale()
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

watch(sale, (now) => { sheet.value = !!now && !wide.value })

function reset() {
  stopPolling()
  forget()
  if (pickedUp !== undefined) toast.remove(pickedUp)
  pickedUp = undefined
  held.value = null
  splitting.value = false
  added.value = null
  sale.value = null
  payment.value = null
  result.value = null
  choice.value = undefined
  part.value = undefined
  saleKey.value = crypto.randomUUID()
}
// What the panels show, such as how many tickets are left, and the session strip are asked again
// once a sale has ended, however it ended.
function afterSale() {
  void refreshNuxtData()
}
function done() {
  const paid = sale.value!
  const change = changeMinor.value
  const sold = filled.value.map(f => f.basket)
  reset()
  afterSale()
  for (const p of panels.value) inputs[p.id] = null
  // The sale stays on the receipt, and each panel that sold something shows what it made, until the
  // seller moves on to the next customer (till proposal, "after the sale").
  finished.value = { intentId: paid.intentId, amountMinor: paid.amountMinor, changeMinor: change, panels: sold }
  // Where the receipt is a sheet, what was paid and any change are said at once as well.
  if (!beside.value) toast.add({ title: t('payments.screens.till.paid', { amount: money(paid.amountMinor) }), description: change > 0 ? t('payments.screens.till.change', { amount: money(change) }) : undefined, color: 'success' })
  emit('settled', { intentId: paid.intentId, amountMinor: paid.amountMinor })
}
/** The sale just paid for, shown until the next customer. */
const finished = ref<{ intentId: string, amountMinor: number, changeMinor: number, panels: string[] } | null>(null)
const settledFor = (id: string) => (finished.value?.panels.includes(id) ? finished.value.intentId : null)
function nextCustomer() {
  finished.value = null
}
// Starting the next sale moves on from the last.
watch(() => filled.value.length, (now) => { if (now) finished.value = null })
function undone() {
  reset()
  afterSale()
  for (const p of panels.value) inputs[p.id] = null
  toast.add({ title: t('payments.screens.till.unfulfilled'), description: t('payments.screens.till.unfulfilled-help'), color: 'error' })
}
function ended() {
  reset()
  afterSale()
  toast.add({ title: t('payments.screens.till.cancelled'), color: 'neutral' })
  sum()
}
</script>

<template>
  <div>
    <EmptyState
      v-if="!usable"
      :title="t('payments.screens.till.no-session')"
      :description="t('payments.screens.till.no-session-help')"
      icon="i-lucide-calculator"
    />

    <DataBoundary
      v-else
      :data="loaded"
      :status="status"
      :error="error"
      :skeleton-rows="3"
      @retry="refresh()"
    >
      <template #default>
        <!-- Which session sales go into, or that one opens with the first sale, and where; the place
             is remembered on this device. -->
        <div
          class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted"
          :class="live ? 'text-base' : 'text-sm'"
        >
          <span v-if="open && session?.session">{{ t('payments.screens.till.session-since', { time: time(session.session.openedAt) }) }}</span>
          <span v-else>{{ t('payments.screens.till.session-opens') }}</span>
          <div class="w-64 max-w-full">
            <PaymentsSessionPlace
              :model-value="open && session?.session ? session.session.spaceId : nextPlace"
              :disabled="!!sale"
              @update:model-value="move"
            />
          </div>
          <UButton
            to="/console/payments/sessions"
            color="neutral"
            variant="ghost"
            :size="live ? 'xl' : 'md'"
            trailing-icon="i-lucide-arrow-right"
            class="ms-auto"
            :label="t('payments.screens.till.your-session')"
          />
        </div>
        <PaymentsHandBack
          :live="live"
          class="mb-6"
        />
        <EmptyState
          v-if="!panels.length"
          :title="t('payments.screens.till.no-panels')"
          :description="t('payments.screens.till.no-panels-help')"
          icon="i-lucide-shopping-basket"
        />
        <div
          v-else
          :class="live ? 'text-lg' : undefined"
        >
          <DefineReceipt>
            <div class="space-y-4">
              <template v-if="!sale || shown.length">
                <div
                  v-if="shown.length"
                  class="divide-y divide-default"
                >
                  <section
                    v-for="g in shown"
                    :key="g.id"
                    class="py-3 first:pt-0"
                  >
                    <h3 class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                      <UIcon
                        v-if="g.icon"
                        :name="g.icon"
                        class="size-4"
                      />{{ g.label }}
                    </h3>
                    <ul class="space-y-2">
                      <li
                        v-for="line in g.lines"
                        :key="line.key"
                        class="flex items-center gap-3 text-base"
                      >
                        <div class="min-w-0 flex-1">
                          <p>{{ line.label }}</p>
                          <p
                            v-if="line.detail"
                            class="text-sm text-muted"
                          >
                            {{ line.detail }}
                          </p>
                        </div>
                        <span
                          v-if="sale && line.quantity > 1"
                          class="text-sm text-muted tabular-nums"
                        >× {{ line.quantity }}</span>
                        <div
                          v-else-if="!sale && line.more && line.fewer"
                          class="flex items-center rounded-lg border border-default"
                        >
                          <IconButton
                            :icon="line.quantity === 1 ? 'i-lucide-trash-2' : 'i-lucide-minus'"
                            :label="t(line.quantity === 1 ? 'payments.screens.till.remove' : 'payments.screens.till.fewer', { name: line.label })"
                            @click="line.fewer()"
                          />
                          <span class="w-7 text-center font-semibold tabular-nums">{{ line.quantity }}</span>
                          <IconButton
                            icon="i-lucide-plus"
                            :label="t('payments.screens.till.more', { name: line.label })"
                            @click="line.more()"
                          />
                        </div>
                        <span class="w-16 text-end tabular-nums">{{ money(line.amountMinor) }}</span>
                      </li>
                    </ul>
                    <div
                      v-if="g.note"
                      class="mt-3 flex items-center gap-2 rounded-lg bg-elevated px-3 py-1.5 text-sm"
                    >
                      <UIcon
                        v-if="g.note.icon"
                        :name="g.note.icon"
                        class="size-4 shrink-0 text-success"
                      />
                      <span class="flex-1">{{ g.note.text }}</span>
                      <UButton
                        v-if="g.note.action && !sale"
                        size="sm"
                        color="neutral"
                        variant="link"
                        :label="g.note.action.label"
                        @click="g.note.action.run()"
                      />
                    </div>
                  </section>
                </div>
                <div
                  v-else-if="finished"
                  class="space-y-3"
                  role="status"
                >
                  <p class="flex items-center gap-2 text-lg font-semibold text-success">
                    <UIcon
                      name="i-lucide-circle-check"
                      class="size-6"
                    />{{ t('payments.screens.till.paid', { amount: money(finished.amountMinor) }) }}
                  </p>
                  <p
                    v-if="finished.changeMinor > 0"
                    class="text-base font-medium"
                  >
                    {{ t('payments.screens.till.change', { amount: money(finished.changeMinor) }) }}
                  </p>
                  <UButton
                    block
                    size="xl"
                    class="justify-center"
                    icon="i-lucide-user-round-plus"
                    :label="t('payments.screens.till.next-customer')"
                    @click="nextCustomer"
                  />
                </div>
                <p
                  v-else
                  class="text-sm text-muted"
                >
                  {{ t('payments.screens.till.nothing-yet') }}
                </p>
              </template>

              <p
                v-if="sale || !finished || groups.length"
                class="flex items-baseline justify-between"
                :class="sale ? undefined : 'border-t border-default pt-3'"
                aria-live="polite"
              >
                <span class="text-lg font-semibold">{{ t('payments.screens.till.total') }}</span>
                <span class="text-3xl font-semibold tabular-nums text-highlighted">{{ money(sale ? sale.amountMinor : total) }}</span>
              </p>

              <RefusalNotice :refusal="refusal" />

              <!-- Splitting, before anything is taken: the amount for the first way, then the way.
                   The basket stays as it is until a way is pressed. -->
              <template v-if="!sale && splitting && methods.length">
                <UFormField
                  :label="t('payments.screens.till.part')"
                  :help="t('payments.screens.till.part-first-help', { amount: money(due) })"
                  :error="partTooMuch ? t('payments.screens.till.part-too-much', { amount: money(due) }) : undefined"
                  required
                >
                  <UInputNumber
                    v-model="part"
                    :min="0"
                    :step="0.01"
                    :increment="false"
                    :decrement="false"
                    :format-options="{ style: 'currency', currency }"
                    class="w-36"
                  />
                </UFormField>
                <div
                  role="group"
                  :aria-label="t('payments.screens.till.how')"
                  class="grid grid-cols-2 gap-2"
                >
                  <UTooltip
                    v-for="m in methods"
                    :key="key(m)"
                    :text="m.label"
                  >
                    <UButton
                      block
                      size="lg"
                      color="neutral"
                      variant="outline"
                      :icon="methodIcon(m)"
                      :loading="taking && choice === key(m)"
                      :disabled="!payable || taking || partMissing || partTooMuch"
                      :label="methodLabel(m)"
                      @click="payWith(m)"
                    />
                  </UTooltip>
                </div>
                <UButton
                  color="neutral"
                  variant="link"
                  icon="i-lucide-arrow-left"
                  :disabled="taking"
                  :label="t('payments.screens.till.split-back')"
                  @click="startSplit(false)"
                />
              </template>
              <!-- Nothing being paid yet: the ways to pay, one press each. -->
              <template v-else-if="!sale && !(finished && !groups.length)">
                <template v-if="methods.length">
                  <UButton
                    block
                    size="xl"
                    class="justify-center py-3"
                    :icon="methodIcon(methods[0]!)"
                    :loading="taking"
                    :disabled="!payable"
                    :label="t('payments.screens.till.pay-by', { method: methodLabel(methods[0]!), amount: money(total) })"
                    @click="payWith(methods[0]!)"
                  />
                  <div class="grid grid-cols-2 gap-2">
                    <UTooltip
                      v-for="m in methods.slice(1)"
                      :key="key(m)"
                      :text="m.label"
                    >
                      <UButton
                        block
                        size="lg"
                        color="neutral"
                        variant="outline"
                        :icon="methodIcon(m)"
                        :disabled="!payable || taking"
                        :label="methodLabel(m)"
                        @click="payWith(m)"
                      />
                    </UTooltip>
                    <UButton
                      block
                      size="lg"
                      color="neutral"
                      variant="outline"
                      icon="i-lucide-split"
                      :disabled="!payable || taking"
                      :label="t('payments.screens.till.split')"
                      @click="startSplit(true)"
                    />
                  </div>
                </template>
                <UButton
                  v-else
                  block
                  size="lg"
                  icon="i-lucide-banknote"
                  :loading="taking"
                  :disabled="!payable"
                  :label="t('payments.screens.till.take', { amount: money(total) })"
                  @click="takePayment"
                />
              </template>

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

                  <UFormField
                    v-if="methods.length && (splitting || paidInPart)"
                    :label="t('payments.screens.till.part')"
                    :hint="partMissing || paidInPart ? undefined : t('payments.screens.optional')"
                    :help="t(paidInPart ? 'payments.screens.till.part-help' : 'payments.screens.till.part-first-help', { amount: money(due) })"
                    :error="partTooMuch ? t('payments.screens.till.part-too-much', { amount: money(due) }) : undefined"
                    :required="!paidInPart"
                  >
                    <UInputNumber
                      v-model="part"
                      :min="0"
                      :step="0.01"
                      :increment="false"
                      :decrement="false"
                      :format-options="{ style: 'currency', currency }"
                      class="w-36"
                    />
                  </UFormField>

                  <!-- No way picked yet, or the last one is finished with: each is a button. -->
                  <div
                    v-if="methods.length && !chosen"
                    role="group"
                    :aria-label="t('payments.screens.till.how')"
                    class="space-y-2"
                  >
                    <p class="text-sm font-medium">
                      {{ t('payments.screens.till.how') }}
                    </p>
                    <UButton
                      v-for="m in methods"
                      :key="key(m)"
                      block
                      size="lg"
                      color="neutral"
                      variant="outline"
                      class="justify-start"
                      :icon="methodIcon(m)"
                      :disabled="taking || partTooMuch || partMissing"
                      @click="choose(m)"
                    >
                      <span class="flex-1 text-start">{{ methodLabel(m) }}</span>
                      <span
                        v-if="!shared(m) && m.method !== 'cash'"
                        class="text-sm text-muted"
                      >{{ m.label }}</span>
                      <UBadge
                        v-if="m.mode === 'test'"
                        color="warning"
                        variant="subtle"
                        :label="t('payments.screens.providers.test-mode')"
                      />
                    </UButton>
                  </div>

                  <template v-if="chosen">
                    <p class="flex items-center gap-2 font-medium">
                      <UIcon
                        :name="methodIcon(chosen)"
                        class="size-5"
                      />{{ methodLabel(chosen) }}
                      <span
                        v-if="!shared(chosen) && chosen.method !== 'cash'"
                        class="text-sm font-normal text-muted"
                      >{{ chosen.label }}</span>
                    </p>
                    <UFormField
                      v-if="chosen.method === 'cash'"
                      :label="t('payments.screens.till.tendered')"
                      :hint="t('payments.screens.optional')"
                      :help="t('payments.screens.till.tendered-help')"
                    >
                      <div class="space-y-2">
                        <UInputNumber
                          v-model="tendered"
                          :min="0"
                          :step="0.01"
                          :increment="false"
                          :decrement="false"
                          :format-options="{ style: 'currency', currency }"
                          class="w-36"
                        />
                        <div
                          class="flex flex-wrap gap-2"
                          role="group"
                          :aria-label="t('payments.screens.till.quick-tender')"
                        >
                          <UButton
                            size="sm"
                            color="neutral"
                            variant="outline"
                            :label="t('payments.screens.till.exact')"
                            @click="tender(taken)"
                          />
                          <UButton
                            v-for="n in quickTender"
                            :key="n"
                            size="sm"
                            color="neutral"
                            variant="outline"
                            :label="money(n)"
                            @click="tender(n)"
                          />
                        </div>
                        <p
                          v-if="change !== null"
                          class="font-medium"
                          :class="change < 0 ? 'text-error' : undefined"
                          aria-live="polite"
                        >
                          {{ change < 0 ? t('payments.screens.till.short', { amount: money(-change) }) : t('payments.screens.till.change-live', { amount: money(change) }) }}
                        </p>
                      </div>
                    </UFormField>
                    <UFormField
                      v-if="chosen.method === 'other_attested'"
                      :label="t('payments.screens.till.other-note')"
                      :hint="t('payments.screens.optional')"
                      :help="t('payments.screens.till.other-note-help')"
                    >
                      <UInput
                        v-model="otherNote"
                        maxlength="200"
                        autocomplete="off"
                      />
                    </UFormField>
                    <UFormField
                      v-if="chosen.method === 'card_reader' && (chosen.readers ?? []).length !== 1"
                      :label="t('payments.screens.test.reader')"
                      required
                    >
                      <USelect
                        v-model="readerId"
                        :items="(chosen.readers ?? []).map(r => ({ value: r.id, label: r.label }))"
                      />
                    </UFormField>

                    <div class="flex flex-wrap gap-2">
                      <UButton
                        size="lg"
                        :loading="taking"
                        :disabled="partTooMuch || partMissing || (chosen.method === 'card_reader' && !readerId) || (chosen.method === 'cash' && change !== null && change < 0)"
                        :label="chosen.method === 'other_attested' ? t('payments.screens.till.received', { amount: money(taken) }) : chosen.method === 'card_attested' ? t('payments.screens.till.approved', { amount: money(taken) }) : chosen.method === 'cash' ? t('payments.screens.till.cash-taken', { amount: money(taken) }) : t('payments.screens.till.start', { amount: money(taken) })"
                        @click="pay()"
                      />
                      <UButton
                        v-if="chosen.method === 'card_attested'"
                        size="lg"
                        color="neutral"
                        variant="outline"
                        :disabled="taking"
                        :label="t('payments.screens.till.machine-declined')"
                        @click="pay(false)"
                      />
                    </div>
                    <UButton
                      v-if="methods.length > 1"
                      color="neutral"
                      variant="link"
                      icon="i-lucide-arrow-left"
                      :disabled="taking"
                      :label="t('payments.screens.till.another-way')"
                      @click="choice = undefined"
                    />
                  </template>
                </template>

                <!-- Money taken for part of the sale stays with it: the rest is taken, or what was taken is given back. -->
                <UButton
                  v-if="paidInPart"
                  block
                  color="neutral"
                  variant="ghost"
                  :disabled="taking || waiting"
                  :label="t('payments.screens.till.give-back-button')"
                  @click="giveBack"
                />
                <UButton
                  v-else
                  block
                  color="neutral"
                  variant="ghost"
                  :disabled="taking"
                  :label="t('payments.screens.till.cancel-button')"
                  @click="cancel"
                />
              </div>
            </div>
          </DefineReceipt>

          <div
            class="grid grid-cols-1 gap-6"
            :class="live ? 'md:grid-cols-[minmax(0,1fr)_24rem]' : 'lg:grid-cols-[minmax(0,1fr)_22rem]'"
          >
            <!-- Every panel stays mounted, so a tab keeps what was put in it while another is shown. -->
            <UTabs
              v-if="tabbed"
              v-model="tab"
              :items="tabs"
              :unmount-on-hide="false"
              size="xl"
              variant="link"
              class="min-w-0"
            >
              <template #panel="{ item }">
                <component
                  :is="panels.find(p => p.id === item.value)!.component"
                  v-model="inputs[item.value]"
                  class="pt-4"
                  :locked="!!sale"
                  :summary="summaryOf(item.value)"
                  :settled="settledFor(item.value)"
                  @receipt="(r: PanelReceipt | null) => said(item.value, r)"
                />
              </template>
            </UTabs>
            <div
              v-else
              class="min-w-0 space-y-6"
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
                  :settled="settledFor(p.id)"
                  @receipt="(r: PanelReceipt | null) => said(p.id, r)"
                />
              </PageSection>
            </div>

            <aside
              v-if="beside"
              :class="live ? 'hidden md:sticky md:top-16 md:block md:self-start' : 'hidden lg:sticky lg:top-4 lg:block lg:self-start'"
              :aria-label="t('payments.screens.till.total-label')"
            >
              <PageSection :title="t('payments.screens.till.sale', { count })">
                <template
                  v-if="groups.length && !sale && !splitting"
                  #actions
                >
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    :label="t('payments.screens.till.clear')"
                    @click="clearAll"
                  />
                </template>
                <Receipt />
              </PageSection>
            </aside>
          </div>

          <!-- No room beside the panels: the sale is in reach of a thumb, and opens as a sheet. -->
          <template v-if="!beside">
            <div
              class="sticky bottom-2 z-10 mt-6 space-y-2 rounded-xl border border-default bg-elevated p-3 shadow-lg"
              :aria-label="t('payments.screens.till.total-label')"
              role="region"
            >
              <p
                v-if="added && !sale"
                class="flex min-w-0 items-center gap-1 text-sm"
                role="status"
              >
                <span class="truncate">{{ t('payments.screens.till.added', { name: added.label }) }}</span>
                <UButton
                  size="sm"
                  variant="link"
                  class="shrink-0"
                  :label="t('payments.screens.till.undo')"
                  @click="added.undo(); added = null"
                />
              </p>
              <div class="flex items-stretch gap-2">
                <UButton
                  color="neutral"
                  variant="soft"
                  size="xl"
                  class="shrink-0"
                  trailing-icon="i-lucide-chevron-up"
                  :label="t('payments.screens.till.sale', { count })"
                  @click="sheet = true"
                />
                <UButton
                  v-if="sale"
                  block
                  size="xl"
                  class="min-w-0 justify-center"
                  :label="t('payments.screens.till.due', { amount: money(due) })"
                  @click="sheet = true"
                />
                <UButton
                  v-else-if="finished && !groups.length"
                  block
                  size="xl"
                  class="min-w-0 justify-center"
                  icon="i-lucide-user-round-plus"
                  :label="t('payments.screens.till.next-customer')"
                  @click="nextCustomer"
                />
                <UButton
                  v-else-if="methods.length"
                  block
                  size="xl"
                  class="min-w-0 justify-center"
                  :icon="methodIcon(methods[0]!)"
                  :loading="taking"
                  :disabled="!payable"
                  :label="t('payments.screens.till.pay-by', { method: methodLabel(methods[0]!), amount: money(total) })"
                  @click="payWith(methods[0]!)"
                />
                <UButton
                  v-else
                  block
                  size="xl"
                  class="min-w-0 justify-center"
                  icon="i-lucide-banknote"
                  :loading="taking"
                  :disabled="!payable"
                  :label="t('payments.screens.till.take', { amount: money(total) })"
                  @click="takePayment"
                />
              </div>
            </div>
            <UDrawer
              v-model:open="sheet"
              :title="t('payments.screens.till.sale', { count })"
              :description="t('payments.screens.till.sale-help')"
            >
              <template #body>
                <Receipt />
              </template>
            </UDrawer>
          </template>
        </div>
      </template>
    </DataBoundary>
  </div>
</template>
