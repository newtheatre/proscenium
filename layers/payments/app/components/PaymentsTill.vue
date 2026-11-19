<!-- The till (Box office specification, part 4): Payments' desk component. Each module with something
     to sell at the desk draws its own panel (payments.desk-basket); the till shows what the filled
     panels add up to, makes the one payment for the total in the seller's open session and takes it
     by any way to pay on offer at the desk. Another way is offered only once an attempt is known to
     have failed, so nobody pays twice. After a sale the panels are emptied; after a cancel they are
     emptied too unless the seller unticks the box, so they can try again. A host narrows the till to some modules' panels
     (Box office's Sell shows only its own); live mode draws the panels as tabs over the one basket,
     each with its larger live panel where its module has one. Coming to the till opens the seller's
     session if none is open, at the place this device used last; a strip above the panels says which
     session sales go into and lets the seller move it. The session is the seller's, not the device's:
     every device they sell on shares it, asks after it every few seconds and when shown again, and
     follows its place, while a sale stays with the device that started it.

     The sale is one receipt beside the panels (till proposal, 17 November 2026): grouped by panel,
     with the ways to pay on it, so paying is one press and not "take payment" and then a choice. A
     panel may hand the receipt its own lines (the `receipt` event), which then carry steppers and
     appear at once, before the server has answered with the total. On a narrow screen the receipt
     is a sheet, and a bar at the foot says what was last added, with an undo, and takes payment. -->
<script setup lang="ts">
import { createReusableTemplate, useDocumentVisibility, useIntervalFn, useMediaQuery, useResizeObserver } from '@vueuse/core'
import type { YourSession } from '../../shared/sessions'
import type { ReceiptTo } from './PaymentsReceiptTo.vue'

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
  /** Ways to finish the panel's part without taking payment, such as reserving to pay later; offered beside the ways to pay, never in live mode. */
  actions?: PanelAction[]
  /** These lines need an email for the receipt before they can be paid for, such as tickets the receipt carries. */
  needsReceipt?: boolean
}
interface PanelAction { key: string, label: string, icon?: string, loading?: boolean, run: () => void }

interface Panel { id: string, module: string, label: string, tab: string, icon: string | null, panel: string, livePanel: string | null }
interface Summary { basket: string, lines: { label: string, amountMinor: number, quantity?: number, item?: string }[], amountMinor: number }
/** A saving on the whole sale, as the server priced it. */
interface Saving { label: string, code: string | null, amountMinor: number }
interface Totals { panels: Summary[], savings?: Saving[], amountMinor: number }
/** A promotion the seller may pick (payments.pricing's choices). */
interface Choice { promotionId: string, label: string, name: string, needsReason: boolean }
/** One person's share of a split sale, as the server holds it once the sale is made. */
interface Share { position: number, amountMinor: number, items: { label: string, quantity: number, amountMinor: number }[], paid: boolean }
interface Offer { providerAccountId: string, provider: string, label: string, method: string, mode: 'live' | 'test', readers?: { id: string, label: string }[] }
type Next = { kind: 'redirect' | 'handoff', url: string } | { kind: 'client-secret', secret: string } | { kind: 'waiting-for-reader' | 'none' }
interface Status { state: string, amountMinor: number, currency: string, paidMinor: number, waiting: boolean, splits?: Share[] }

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
const { confirm, confirmTicked } = useConfirm()
const toast = useToast()
// The till's toasts replace one another rather than stacking up.
const TOAST = 'payments-till'

const { data: session, refresh: refreshSession } = await useAPI<YourSession>('/api/payments/session', { key: 'payments:session' })
const open = computed(() => session.value?.session?.state === 'open')
// The till is usable by someone with a session open or who may open one: the session itself waits
// for the first sale, so coming to the till by mistake leaves nothing behind.
const usable = computed(() => open.value || !!session.value?.mayOpen)
// The seller's other devices open, move and sell in the same session: the server says when it
// changes (useRealtime), and where it cannot, the strip asks again by itself.
const SESSION_REFRESH = 15_000 // not-policy: how often the till asks after the shared session without news
const visibility = useDocumentVisibility()
const { connected: told } = useRealtime('payments.session', () => {
  void refreshSession()
  // A sale being taken on a linked device, or answered by a reader, moves on at once. Not while this
  // device is itself taking it: its own answer carries the change to give, and comes first.
  if (sale.value && !taking.value) void check().catch(() => {})
})
useIntervalFn(() => { if (visibility.value === 'visible' && !told.value) void refreshSession() }, SESSION_REFRESH)
watch(visibility, (now) => { if (now === 'visible') void refreshSession() })
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
onMounted(() => {
  if (open.value && session.value?.session) remember(session.value.session.spaceId)
  else nextPlace.value = deviceSpace() ?? session.value?.defaultSpaceId ?? null
})
function remember(spaceId: string | null) {
  try { localStorage.setItem(SPACE_KEY, spaceId ?? '') }
  catch { /* storage refused: the next session opens at the default */ }
  nextPlace.value = spaceId
}
// Moved on another of the seller's devices: this one follows, so a session reopened here opens there too.
watch(() => (open.value ? session.value?.session?.spaceId : undefined), (spaceId) => {
  if (spaceId !== undefined && spaceId !== deviceSpace()) remember(spaceId)
})
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
  remember(spaceId)
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

// What the seller added to the whole sale (the unified promotions design): codes the customer gave,
// and discounts picked from the till's list, each with its reason where one is asked for. The server
// prices every panel together with them; a panel never sees them.
const pricing = reactive<{ codes: string[], staff: { promotionId: string, label: string, reason?: string }[] }>({ codes: [], staff: [] })
const pricingOf = (p: typeof pricing) => (p.codes.length || p.staff.length ? { codes: p.codes, staff: p.staff.map(s => ({ promotionId: s.promotionId, ...(s.reason ? { reason: s.reason } : {}) })) } : undefined)
function emptyPanels() {
  for (const p of panels.value) inputs[p.id] = null
  pricing.codes = []
  pricing.staff = []
}

// What the filled panels add up to, asked again shortly after the seller stops changing them.
const summary = ref<Totals | null>(null)
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
    const answer = await $api<Totals>('/api/payments/till/summary', { method: 'POST', body: { panels: filled.value, pricing: pricingOf(pricing) } })
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
watch([filled, () => pricing.codes.length + pricing.staff.length], () => {
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
// The savings on the sale are a group of their own at the foot, each taken off the total.
const SAVINGS = 'payments.savings'
const savingsGroup = computed<ReceiptGroup | null>(() => {
  const savings = summary.value?.savings ?? []
  if (!savings.length || stale.value || summing.value) return null
  return { id: SAVINGS, label: t('payments.screens.till.savings'), icon: 'i-lucide-ticket-percent', note: null, counted: false, lines: savings.map((v, i) => ({ key: String(i), label: v.code ? t('payments.screens.till.saving-code', { label: v.label, code: v.code }) : v.label, quantity: 1, amountMinor: -v.amountMinor })) }
})
const groups = computed<ReceiptGroup[]>(() => panels.value.flatMap<ReceiptGroup>((p) => {
  if (inputs[p.id] === null || inputs[p.id] === undefined) return []
  const own = receipts[p.id]
  const lines: ReceiptLine[] = own?.lines.length ? own.lines : (summaryOf(p.id)?.lines ?? []).map((l, i) => ({ key: String(i), label: l.label, quantity: 1, amountMinor: l.amountMinor }))
  return lines.length ? [{ id: p.id, label: t(p.tab), icon: p.icon, lines, note: own?.note ?? null, counted: !!own?.lines.length }] : []
}).concat(savingsGroup.value ? [savingsGroup.value] : []))
const countOf = (list: ReceiptGroup[]) => list.filter(g => g.id !== SAVINGS).reduce((sum, g) => sum + (g.counted ? g.lines.reduce((n, l) => n + l.quantity, 0) : g.lines.length), 0)
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
// The panels' other ways to finish, at the console's till only: live mode takes payment and nothing else.
const panelActions = computed(() => (props.live ? [] : panels.value.flatMap(p => (inputs[p.id] === null || inputs[p.id] === undefined ? [] : receipts[p.id]?.actions ?? []))))
function clearAll() {
  emptyPanels()
  added.value = null
}

// The sale opens as a sheet where there is no room beside the panels. A scrolling box takes a swipe
// as a scroll, so the sheet's body only scrolls when the sale is too long to fit.
const sheet = ref(false)
const sheetBody = ref<HTMLElement | null>(null)
const sheetScrolls = ref(false)
useResizeObserver(() => [sheetBody.value, sheetBody.value?.parentElement], () => {
  const body = sheetBody.value?.parentElement
  sheetScrolls.value = !!body && body.scrollHeight > body.clientHeight + 1
})

// One box on the receipt for a code the customer gives or a discount from the till's list. Each is
// tried against the sale before it is added, so a code that cannot be used says why under the box.
const codeTyped = ref('')
const picked = ref<string | undefined>(undefined)
const reason = ref('')
const choices = ref<Choice[] | null>(null)
const discountRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const trying = ref(false)
const pickedChoice = computed(() => choices.value?.find(c => c.promotionId === picked.value))
const choiceItems = computed<{ type?: 'label', value?: string, label: string, icon?: string }[]>(() => choices.value?.length
  ? [{ type: 'label', label: t('payments.screens.till.discount-list') }, ...choices.value.map(c => ({ value: c.promotionId, label: c.name, icon: 'i-lucide-badge-percent' }))]
  : [])
async function loadChoices() {
  if (choices.value) return
  try { choices.value = (await $api<{ choices: Choice[] }>('/api/payments/till/discounts')).choices }
  catch { choices.value = [] }
}
function clearDiscountBox() {
  codeTyped.value = ''
  picked.value = undefined
  reason.value = ''
  discountRefusal.value = null
}
async function tryAdding(next: typeof pricing) {
  trying.value = true
  discountRefusal.value = null
  try {
    const answer = await $api<Totals>('/api/payments/till/summary', { method: 'POST', body: { panels: filled.value, pricing: pricingOf(next) } })
    pricing.codes = next.codes
    pricing.staff = next.staff
    summary.value = answer
    clearDiscountBox()
  }
  catch (e) {
    discountRefusal.value = toRefusal(e)
  }
  finally {
    trying.value = false
  }
}
function addCode(typed?: string) {
  const code = (typed ?? codeTyped.value).trim()
  if (!code) return
  picked.value = undefined
  void tryAdding({ codes: [...pricing.codes.filter(c => c.toUpperCase() !== code.toUpperCase()), code], staff: pricing.staff })
}
function addPicked() {
  const choice = pickedChoice.value
  if (!choice || (choice.needsReason && !reason.value.trim())) return
  void tryAdding({ codes: pricing.codes, staff: [...pricing.staff.filter(s => s.promotionId !== choice.promotionId), { promotionId: choice.promotionId, label: choice.label, ...(reason.value.trim() ? { reason: reason.value.trim() } : {}) }] })
}
// A discount that asks for a reason waits for one; any other is given as soon as it is picked.
watch(picked, () => {
  discountRefusal.value = null
  reason.value = ''
  if (pickedChoice.value && !pickedChoice.value.needsReason) addPicked()
})
function removeDiscount(label: string, next: typeof pricing) {
  const before = { codes: [...pricing.codes], staff: [...pricing.staff] }
  pricing.codes = next.codes
  pricing.staff = next.staff
  toast.add({ id: TOAST, title: t('payments.screens.till.discount-removed', { name: label }), color: 'neutral', actions: [{ label: t('payments.screens.till.undo'), color: 'neutral', variant: 'outline', onClick: () => Object.assign(pricing, before) }] })
}
const addedDiscounts = computed(() => [
  ...pricing.codes.map(code => ({ key: `code:${code}`, label: code.toUpperCase(), remove: () => removeDiscount(code.toUpperCase(), { codes: pricing.codes.filter(c => c !== code), staff: pricing.staff }) })),
  ...pricing.staff.map(s => ({ key: `staff:${s.promotionId}`, label: s.label, remove: () => removeDiscount(s.label, { codes: pricing.codes, staff: pricing.staff.filter(x => x.promotionId !== s.promotionId) }) })),
])

// The receipt is drawn once and shown beside the panels, or in a sheet where there is no room.
const [DefineReceipt, Receipt] = createReusableTemplate()
// Live mode keeps the receipt beside the tiles from 900px: on a tablet held upright it would take half
// the screen, so it is a sheet there, with the total pinned at the foot.
const wide = useMediaQuery(() => (props.live ? '(min-width: 900px)' : '(min-width: 1024px)'))
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const beside = computed(() => !mounted.value || wide.value)
// Payment can start once the server has agreed the total.
// A panel may need the receipt's email before its part is paid for; a split sale asks each person.
const receiptNeeded = computed(() => panels.value.some(p => inputs[p.id] !== null && inputs[p.id] !== undefined && receipts[p.id]?.needsReceipt))
const payable = computed(() => groups.value.some(g => g.id !== SAVINGS) && !stale.value && !summing.value && !!summary.value && summary.value.amountMinor > 0
  && (!receiptNeeded.value || splitting.value || !!receiptTo.value[0]))

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
interface Kept { intentId: string, inputs: Record<string, unknown>, held: ReceiptGroup[], splitting: boolean }
function keep() {
  if (!sale.value) return
  const kept: Kept = {
    intentId: sale.value.intentId,
    inputs: Object.fromEntries(panels.value.flatMap(p => (inputs[p.id] === null || inputs[p.id] === undefined ? [] : [[p.id, inputs[p.id]]]))),
    held: held.value ?? [],
    splitting: splitting.value,
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
/** The sale this device is taking: its id, null for none, or undefined where storage cannot say. */
function keptSale(): string | null | undefined {
  try { return (JSON.parse(localStorage.getItem(SALE_KEY) ?? 'null') as Kept | null)?.intentId ?? null }
  catch { return undefined }
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
    // A split sale says who pays for which items; the server works out each person's amount.
    const splits = splitting.value ? plan.value.map(p => ({ items: p.items.map(i => ({ basket: i.basket, line: i.line, quantity: i.quantity })) })) : undefined
    const sell = () => $api<{ intentId: string, amountMinor: number }>('/api/payments/till/sale', { method: 'POST', body: { panels: filled.value, splits, receipt: splits ? undefined : destination(receiptTo.value[0]), pricing: pricingOf(pricing) }, headers: { 'idempotency-key': saleKey.value } })
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
// Splitting the bill by item (Matt, 18 November 2026): each item on the receipt is given to a person,
// and each person pays for their own items, so nobody types an amount. One item cannot be split.
const splitting = ref(false)
const paidInPart = computed(() => (payment.value?.paidMinor ?? 0) > 0)
/** One of something on the receipt, as the server's summary counts them. */
interface Unit { basket: string, line: number, label: string, amountMinor: number }
/** A line's amount shared between its units, the first taking the odd pennies, as the server does. */
function shares(amountMinor: number, quantity: number): number[] {
  const each = Math.floor(amountMinor / quantity)
  return Array.from({ length: quantity }, (_, i) => each + (i < amountMinor - each * quantity ? 1 : 0))
}
const units = computed<Unit[]>(() => (summary.value?.panels ?? []).flatMap(p => p.lines.flatMap((l, line) => {
  const quantity = Math.max(1, l.quantity ?? 1)
  return shares(l.amountMinor, quantity).map(amountMinor => ({ basket: p.basket, line, label: l.item ?? l.label, amountMinor }))
})))
const canSplit = computed(() => units.value.length >= 2)
// Who pays for each unit, by person number, and how many people there are.
const people = ref(2)
const owners = ref<number[]>([])
/** Split, before anything is taken: the items are shared out between two people to start with. */
function startSplit(on: boolean) {
  splitting.value = on
  people.value = 2
  owners.value = units.value.map((_, i) => (i % 2) + 1)
  receiptTo.value = on ? { 1: receiptTo.value[0] } : { 0: receiptTo.value[1] }
}
// When the receipt changes while splitting, a new item goes to the first person.
watch(() => units.value.map(u => `${u.basket} ${u.line}`).join('|'), (now, before) => {
  if (!splitting.value || sale.value || now === before) return
  owners.value = units.value.map((_, i) => Math.min(owners.value[i] ?? 1, people.value))
})
function addPerson() {
  if (people.value < units.value.length) people.value++
}
/** Takes the last person away; their items go to the first. */
function removePerson() {
  if (people.value <= 2) return
  owners.value = owners.value.map(o => (o === people.value ? 1 : o))
  people.value--
}
/** Each person's items and amount, worked out as the server will: a line's units go to people in order. */
const plan = computed(() => {
  const byLine = new Map<string, number[]>()
  units.value.forEach((u, i) => {
    const key = `${u.basket} ${u.line}`
    byLine.set(key, [...(byLine.get(key) ?? []), owners.value[i] ?? 1])
  })
  return Array.from({ length: people.value }, (_, n) => n + 1).map((position) => {
    const items: { basket: string, line: number, label: string, quantity: number, amountMinor: number }[] = []
    for (const [key, who] of byLine) {
      const first = units.value.find(u => `${u.basket} ${u.line}` === key)!
      const lineShares = shares(units.value.filter(u => `${u.basket} ${u.line}` === key).reduce((sum, u) => sum + u.amountMinor, 0), who.length)
      const sorted = [...who].sort((a, b) => a - b)
      const mine = sorted.flatMap((o, i) => (o === position ? [lineShares[i]!] : []))
      if (mine.length) items.push({ basket: first.basket, line: first.line, label: first.label, quantity: mine.length, amountMinor: mine.reduce((sum, a) => sum + a, 0) })
    }
    return { position, items, amountMinor: items.reduce((sum, i) => sum + i.amountMinor, 0) }
  })
})
// Everyone must have something to pay for before the sale is made.
const planIncomplete = computed(() => splitting.value && plan.value.some(p => p.amountMinor <= 0))
/** The people paying: the plan before the sale is made, then the server's, with who has paid. */
const persons = computed<Share[]>(() => payment.value?.splits?.length
  ? payment.value.splits
  : splitting.value ? plan.value.map(p => ({ position: p.position, amountMinor: p.amountMinor, items: p.items.map(i => ({ label: i.label, quantity: i.quantity, amountMinor: i.amountMinor })), paid: false })) : [])
const isSplit = computed(() => persons.value.length > 0)
// Who each receipt goes to: 0 for a whole sale, or each person of a split one. Kept on the screen
// only, never on the device. The receipt carries any tickets too, so there is no other email box.
const receiptTo = ref<Record<number, ReceiptTo | undefined>>({})
const destination = (to: ReceiptTo | undefined) => (!to ? undefined : 'accountId' in to ? { accountId: to.accountId } : { email: to.email })
// The person whose payment is being taken now.
const paying = ref<number | null>(null)
const payingFor = computed(() => persons.value.find(p => p.position === paying.value) ?? null)
// A way to pay that needs nothing more from the seller starts as soon as it is pressed.
// A reader is chosen only where the provider pairs readers; the SumUp app hand-off lists none.
const needsReader = (m: Offer) => m.method === 'card_reader' && !!m.readers && m.readers.length !== 1
const direct = (m: Offer) => m.method !== 'cash' && !m.method.endsWith('_attested') && !needsReader(m)
async function choose(m: Offer) {
  choice.value = key(m)
  await nextTick()
  if (direct(m)) await pay()
}
/** One press from the receipt: makes the sale, then pays this way. */
async function payWith(m: Offer) {
  await takePayment()
  if (!sale.value) return
  await choose(m)
}
/** One person pays their share this way; the first press makes the sale with the plan. */
async function payPerson(position: number, m: Offer) {
  paying.value = position
  if (!sale.value) await takePayment()
  if (!sale.value) {
    paying.value = null
    return
  }
  await choose(m)
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
// What this payment takes: the paying person's share in a split sale, otherwise all that is due.
const taken = computed(() => payingFor.value?.amountMinor ?? due.value)
const splitOf = () => (isSplit.value && paying.value !== null
  ? { split: paying.value, receipt: destination(receiptTo.value[paying.value]) }
  : { receipt: destination(receiptTo.value[0]) })
watch(splitting, () => keep())
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
  const asked = sale.value.intentId
  const before = payment.value?.paidMinor ?? 0
  const now = await $api<Status>(`/api/payments/intents/${asked}` as string)
  // Asked twice at once, as by news and the timer: the first answer may already have ended the sale.
  if (sale.value?.intentId !== asked) return
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
        body: { providerAccountId: m.providerAccountId, method: m.method, ...splitOf(), tenderedMinor: handed, note: m.method === 'other_attested' ? otherNote.value.trim() || undefined : undefined, succeeded: m.method === 'cash' ? undefined : succeeded },
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
        body: { providerAccountId: m.providerAccountId, method: m.method, readerId: readerId.value, ...splitOf(), returnTo: route.path },
        headers: { 'idempotency-key': sale.value.key },
      })
      sale.value.key = crypto.randomUUID()
      if (started.unfulfilled) return undone()
      if (started.settled) return check()
      if (started.state === 'failed') {
        result.value = { kind: 'declined' }
        return
      }
      if (started.next.kind === 'handoff' || started.next.kind === 'redirect') {
        result.value = { kind: 'handoff', url: started.next.url }
        // Straight into the SumUp app; the Open button stays for a browser that holds the switch back.
        if (started.next.kind === 'handoff') window.location.assign(started.next.url)
      }
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
  toast.add({ id: TOAST, title: t('payments.screens.till.part-paid', { amount: money(amountMinor), due: money(due.value) }), description: change > 0 ? t('payments.screens.till.change', { amount: money(change) }) : undefined, color: 'success' })
  changeMinor.value = 0
  choice.value = undefined
  paying.value = null
}

// Back from a hand-off to another app, such as SumUp's: the page has loaded afresh, so the sale is
// picked up again from its payment, and what the app said is shown. The address is then cleaned so a
// reload does not repeat it.
// The note that a payment was picked up after a reload, taken away once that payment has ended.
let pickedUp: string | number | undefined
// Back from SumUp, the address and the linked room can both pick up the same sale; the second finish
// would find the panels already emptied and lose the after-sale panel.
const resuming = new Set<string>()
async function resume(intentId: string, said: string) {
  if (resuming.has(intentId) || finished.value?.intentId === intentId) return
  resuming.add(intentId)
  try {
    const now = await $api<Status>(`/api/payments/intents/${intentId}` as string)
    if (finished.value?.intentId === intentId) return
    // What this device kept of it: its lines, what was in the panels, and any split under way.
    const was = kept(intentId)
    if (was) {
      held.value = was.held
      for (const p of panels.value) {
        if (p.id in was.inputs) inputs[p.id] = was.inputs[p.id]
      }
      splitting.value = was.splitting
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
    else if (said === 'reload') pickedUp = toast.add({ id: `${TOAST}-picked-up`, title: t('payments.screens.till.picked-up', { amount: money(now.amountMinor - now.paidMinor) }), description: t('payments.screens.till.picked-up-help'), color: 'warning' }).id
    else if (said === 'linked') return
    else if (said === 'succeeded') toast.add({ id: TOAST, title: t('payments.screens.session.handoff.succeeded'), description: t('payments.screens.till.due', { amount: money(now.amountMinor - now.paidMinor) }), color: 'success' })
    else if (said === 'failed') result.value = { kind: 'declined' }
    else toast.add({ id: TOAST, title: t('payments.screens.session.handoff.unknown'), description: t('payments.screens.session.handoff.unknown-help'), color: 'warning' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    resuming.delete(intentId)
  }
}
onMounted(() => {
  const { intent, result: said, attempt, ...rest } = route.query
  if (typeof intent === 'string' && typeof said === 'string' && attempt) {
    void router.replace({ query: rest })
    if (session.value?.session) void resume(intent, said)
    return
  }
  // A sale this device left open, such as by a reload, is picked up again; another device's is left to it.
  const mine = keptSale()
  const left = mine === undefined ? session.value?.unfinished : session.value?.openSales?.find(s => s.intentId === mine)
  if (left) void resume(left.intentId, 'reload')
  else if (mine) forget()
})

// Linked tills (linked tills proposal, 19 November 2026): every device signed in to the seller's
// account that has the till open shares one sale. What is in the panels, the codes and discounts and
// the payment being taken are passed to the others as they change (useRealtime, device.payments.till)
// and kept by the room for a device that arrives later. A device can disconnect, and then stays its
// own till, on that device, until it is linked again. Money is not passed this way: each device
// reads the payment from the server, as it always has.
const SOLO_KEY = 'payments.till.solo'
interface SharedSale { rev: number, by: string, inputs: Record<string, unknown>, pricing: { codes: string[], staff: { promotionId: string, label: string, reason?: string }[] }, sale: { intentId: string, by: string, held: ReceiptGroup[], splitting: boolean } | null }
const solo = ref(false)
/** The device that started the payment being taken, where it was not this one. */
const saleBy = ref<string | null>(null)
/** Another device's sale that arrived while this one had items too: the seller says which to keep. */
const clash = ref<SharedSale | null>(null)
let rev = 0
let applying = false
let lastShared = ''
const link = useRealtime('device.payments.till', (data, meta) => { void heard(data as SharedSale | null, meta) })
const others = computed(() => link.devices.value.filter(d => d.id !== link.deviceId()))
const linked = computed(() => !solo.value && link.connected.value && others.value.length > 0)
const nameOf = (id: string | null) => link.devices.value.find(d => d.id === id)?.name ?? t('payments.screens.till.linked.another-device')
const syncLabel = computed(() => {
  if (solo.value) return t('payments.screens.till.linked.button-solo')
  if (!others.value.length) return t('payments.screens.till.linked.button-alone')
  return others.value.length === 1 ? t('payments.screens.till.linked.button-linked', { name: others.value[0]!.name }) : t('payments.screens.till.linked.button-linked-many', { count: others.value.length })
})
const deviceLabel = ref('')
watch(link.deviceName, (now) => { deviceLabel.value = now }, { immediate: true })

function snapshot(): SharedSale {
  return JSON.parse(JSON.stringify({
    rev,
    by: link.deviceId(),
    inputs: Object.fromEntries(filled.value.map(f => [f.basket, f.input])),
    pricing: { codes: pricing.codes, staff: pricing.staff },
    sale: sale.value ? { intentId: sale.value.intentId, by: saleBy.value ?? link.deviceId(), held: plain(held.value ?? []), splitting: splitting.value } : null,
  })) as SharedSale
}
/** What a sale holds, without who said it or when: two devices with the same have nothing to pass on. */
const contentOf = (s: SharedSale) => JSON.stringify([s.inputs, s.pricing, s.sale?.intentId ?? null, s.sale?.splitting ?? false])
const holds = (s: SharedSale) => Object.keys(s.inputs).length > 0 || !!s.sale

function share() {
  if (solo.value || applying || !link.connected.value) return
  const mine = snapshot()
  if (contentOf(mine) === lastShared) return
  mine.rev = ++rev
  lastShared = contentOf(mine)
  link.send(mine, { keep: true })
}
let sharing: ReturnType<typeof setTimeout> | undefined
watch([filled, () => JSON.stringify(pricing), () => sale.value?.intentId ?? null, splitting], () => {
  if (applying || solo.value) return
  clearTimeout(sharing)
  sharing = setTimeout(share, 150) // not-policy: a pause so one press is one message
}, { deep: true })

async function adopt(theirs: SharedSale) {
  clash.value = null
  // The room still holds a sale this device has just finished, such as on return from SumUp.
  if (theirs.sale && theirs.sale.intentId === finished.value?.intentId) {
    rev = Math.max(rev, theirs.rev)
    lastShared = ''
    return share()
  }
  rev = theirs.rev
  lastShared = contentOf(theirs)
  // The payment ended on the other device: the server says how, before the panels are emptied.
  if (sale.value && theirs.sale?.intentId !== sale.value.intentId) {
    await check().catch(() => {})
    if (sale.value) reset()
  }
  applying = true
  try {
    for (const p of panels.value) {
      const value = theirs.inputs[p.id] ?? null
      if (JSON.stringify(inputs[p.id] ?? null) !== JSON.stringify(value)) inputs[p.id] = value
    }
    pricing.codes = [...theirs.pricing.codes]
    pricing.staff = [...theirs.pricing.staff]
    await nextTick()
  }
  finally {
    applying = false
  }
  if (theirs.sale && sale.value?.intentId !== theirs.sale.intentId) {
    saleBy.value = theirs.sale.by === link.deviceId() ? null : theirs.sale.by
    held.value = theirs.sale.held
    splitting.value = theirs.sale.splitting
    await resume(theirs.sale.intentId, 'linked')
  }
}

async function heard(theirs: SharedSale | null, meta: { from: string | null, kept: boolean }) {
  if (solo.value) return
  if (!theirs) {
    // The room keeps nothing: what this device holds becomes the linked sale.
    if (meta.kept) {
      lastShared = ''
      share()
    }
    return
  }
  if (meta.kept) {
    const mine = snapshot()
    if (contentOf(mine) === contentOf(theirs)) {
      rev = Math.max(rev, theirs.rev)
      lastShared = contentOf(theirs)
      return
    }
    if (!holds(theirs)) {
      rev = Math.max(rev, theirs.rev)
      lastShared = ''
      return share()
    }
    // Both have something, and a payment cannot be set aside: the seller chooses.
    if (holds(mine) && theirs.by !== link.deviceId() && !theirs.sale && !sale.value) {
      clash.value = theirs
      return
    }
    if (sale.value) return
  }
  else if (theirs.rev < rev || (theirs.rev === rev && theirs.by <= link.deviceId())) {
    return
  }
  await adopt(theirs)
}
function keepMine() {
  if (!clash.value) return
  rev = Math.max(rev, clash.value.rev)
  clash.value = null
  lastShared = ''
  share()
}

/** This device becomes its own till. The sale stays with the others, unless this device is taking the payment. */
function disconnect() {
  solo.value = true
  clash.value = null
  try { localStorage.setItem(SOLO_KEY, '1') }
  catch { /* storage refused: the device links again when the page is loaded */ }
  if (!linkedBefore()) return
  if (sale.value && !saleBy.value) return
  if (sale.value) reset()
  emptyPanels()
}
// Whether there was anyone to leave: a device alone in the room keeps what it has.
const linkedBefore = () => link.connected.value && others.value.length > 0
function linkAgain() {
  solo.value = false
  try { localStorage.removeItem(SOLO_KEY) }
  catch { /* nothing kept */ }
  lastShared = ''
  link.ask()
}
onMounted(() => {
  try { solo.value = localStorage.getItem(SOLO_KEY) === '1' }
  catch { /* storage refused: linked, as a new device is */ }
})

const waiting = computed(() => result.value?.kind === 'waiting' || result.value?.kind === 'handoff' || !!payment.value?.waiting)

async function cancel() {
  if (!sale.value) return
  // Emptying the basket is ticked by default (Matt, 18 November): mostly the customer has gone.
  const ok = await confirmTicked({
    verb: t('payments.screens.till.cancel-verb'),
    thing: money(sale.value.amountMinor),
    consequence: waiting.value ? t('payments.screens.till.cancel-waiting') : t('payments.screens.till.cancel-consequence'),
    button: t('payments.screens.till.cancel-button'),
    tick: { label: t('payments.screens.till.cancel-empty'), ticked: true },
  })
  if (!ok) return
  taking.value = true
  try {
    await $api(`/api/payments/intents/${sale.value.intentId}/cancel` as string, { method: 'POST', body: {} })
    if (ok.ticked) emptyPanels()
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
    emptyPanels()
    toast.add({ id: TOAST, title: t('payments.screens.till.given-back'), description: said || undefined, color: 'success' })
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
  saleBy.value = null
  payment.value = null
  result.value = null
  choice.value = undefined
  paying.value = null
  receiptTo.value = {}
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
  const split = isSplit.value
  const receiptSent = !split && !!receiptTo.value[0]
  reset()
  afterSale()
  emptyPanels()
  // The sale stays on the receipt, and each panel that sold something shows what it made, until the
  // seller moves on to the next customer (till proposal, "after the sale").
  finished.value = { intentId: paid.intentId, amountMinor: paid.amountMinor, changeMinor: change, panels: sold, split, receiptSent }
  afterTo.value = undefined
  // Where the receipt is a sheet, what was paid and any change are said at once as well.
  if (!beside.value) toast.add({ title: t('payments.screens.till.paid', { amount: money(paid.amountMinor) }), description: change > 0 ? t('payments.screens.till.change', { amount: money(change) }) : undefined, color: 'success' })
  emit('settled', { intentId: paid.intentId, amountMinor: paid.amountMinor })
}
/** The sale just paid for, shown until the next customer. */
const finished = ref<{ intentId: string, amountMinor: number, changeMinor: number, panels: string[], split: boolean, receiptSent: boolean } | null>(null)
// A receipt asked for after paying.
const afterTo = ref<ReceiptTo | undefined>()
const sending = ref(false)
async function sendAfter() {
  if (!finished.value || !afterTo.value) return
  sending.value = true
  refusal.value = null
  try {
    await $api(`/api/payments/intents/${finished.value.intentId}/receipt` as string, { method: 'POST', body: { receipt: destination(afterTo.value) } })
    finished.value = { ...finished.value, receiptSent: true }
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    sending.value = false
  }
}
const settledFor = (id: string) => (finished.value?.panels.includes(id) ? finished.value.intentId : null)
function nextCustomer() {
  finished.value = null
}
// Starting the next sale moves on from the last.
watch(() => filled.value.length, (now) => { if (now) finished.value = null })
function undone() {
  reset()
  afterSale()
  emptyPanels()
  toast.add({ id: TOAST, title: t('payments.screens.till.unfulfilled'), description: t('payments.screens.till.unfulfilled-help'), color: 'error' })
}
function ended() {
  reset()
  afterSale()
  toast.add({ id: TOAST, title: t('payments.screens.till.cancelled'), color: 'neutral' })
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
        <!-- On a phone the strip is one line, and the place and the session are in its menu. -->
        <div class="mb-4 flex items-center gap-2 text-sm text-muted sm:hidden">
          <UIcon
            name="i-lucide-clock"
            class="size-4 shrink-0"
          />
          <span class="min-w-0 flex-1 truncate">{{ open && session?.session ? t('payments.screens.till.session-since-short', { time: time(session.session.openedAt) }) : t('payments.screens.till.session-opens-short') }}</span>
          <UPopover v-if="link.connected.value">
            <UButton
              color="neutral"
              variant="outline"
              :size="live ? 'lg' : 'sm'"
              :icon="linked ? 'i-lucide-link' : 'i-lucide-unlink'"
              :label="syncLabel"
              data-testid="till-sync"
            />
            <template #content>
              <div class="w-80 max-w-[90vw] space-y-3 p-3 text-sm">
                <p class="font-medium text-highlighted">
                  {{ t('payments.screens.till.linked.title') }}
                </p>
                <UFormField :label="t('payments.screens.till.linked.this-device')">
                  <UInput
                    v-model="deviceLabel"
                    maxlength="60"
                    @change="link.rename(deviceLabel)"
                  />
                </UFormField>
                <p
                  v-if="!others.length"
                  class="text-muted"
                >
                  {{ t('payments.screens.till.linked.none') }}
                </p>
                <ul
                  v-else
                  class="space-y-1"
                >
                  <li
                    v-for="d in others"
                    :key="d.id"
                    class="flex items-center justify-between gap-2"
                  >
                    <span class="min-w-0 truncate">{{ d.name }}</span>
                    <UBadge
                      :color="solo ? 'neutral' : 'success'"
                      variant="subtle"
                      :label="solo ? t('payments.screens.till.linked.not-linked') : t('payments.screens.till.linked.in-sync')"
                    />
                  </li>
                </ul>
                <p class="text-muted">
                  {{ solo ? t('payments.screens.till.linked.help-solo') : t('payments.screens.till.linked.help-linked') }}
                </p>
                <UButton
                  v-if="solo"
                  block
                  icon="i-lucide-link"
                  :label="t('payments.screens.till.linked.link')"
                  @click="linkAgain"
                />
                <UButton
                  v-else
                  block
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-unlink"
                  :label="t('payments.screens.till.linked.disconnect')"
                  @click="disconnect"
                />
              </div>
            </template>
          </UPopover>
          <UPopover>
            <IconButton
              icon="i-lucide-map-pin"
              :label="t('payments.screens.till.session-menu')"
            />
            <template #content>
              <div class="w-72 space-y-3 p-3">
                <PaymentsSessionPlace
                  :model-value="open && session?.session ? session.session.spaceId : nextPlace"
                  :disabled="!!sale"
                  class="w-full"
                  @update:model-value="move"
                />
                <UButton
                  to="/console/payments/sessions"
                  color="neutral"
                  variant="ghost"
                  block
                  trailing-icon="i-lucide-arrow-right"
                  :label="t('payments.screens.till.your-session')"
                />
              </div>
            </template>
          </UPopover>
        </div>
        <div
          class="mb-6 hidden flex-wrap items-center gap-x-3 gap-y-2 text-muted sm:flex"
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
          <UPopover v-if="link.connected.value">
            <UButton
              color="neutral"
              variant="outline"
              :size="live ? 'lg' : 'sm'"
              :icon="linked ? 'i-lucide-link' : 'i-lucide-unlink'"
              :label="syncLabel"
              data-testid="till-sync-wide"
            />
            <template #content>
              <div class="w-80 max-w-[90vw] space-y-3 p-3 text-sm">
                <p class="font-medium text-highlighted">
                  {{ t('payments.screens.till.linked.title') }}
                </p>
                <UFormField :label="t('payments.screens.till.linked.this-device')">
                  <UInput
                    v-model="deviceLabel"
                    maxlength="60"
                    @change="link.rename(deviceLabel)"
                  />
                </UFormField>
                <p
                  v-if="!others.length"
                  class="text-muted"
                >
                  {{ t('payments.screens.till.linked.none') }}
                </p>
                <ul
                  v-else
                  class="space-y-1"
                >
                  <li
                    v-for="d in others"
                    :key="d.id"
                    class="flex items-center justify-between gap-2"
                  >
                    <span class="min-w-0 truncate">{{ d.name }}</span>
                    <UBadge
                      :color="solo ? 'neutral' : 'success'"
                      variant="subtle"
                      :label="solo ? t('payments.screens.till.linked.not-linked') : t('payments.screens.till.linked.in-sync')"
                    />
                  </li>
                </ul>
                <p class="text-muted">
                  {{ solo ? t('payments.screens.till.linked.help-solo') : t('payments.screens.till.linked.help-linked') }}
                </p>
                <UButton
                  v-if="solo"
                  block
                  icon="i-lucide-link"
                  :label="t('payments.screens.till.linked.link')"
                  @click="linkAgain"
                />
                <UButton
                  v-else
                  block
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-unlink"
                  :label="t('payments.screens.till.linked.disconnect')"
                  @click="disconnect"
                />
              </div>
            </template>
          </UPopover>
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
        <UAlert
          v-if="clash"
          class="mb-6"
          color="warning"
          variant="subtle"
          icon="i-lucide-link"
          :title="t('payments.screens.till.linked.clash', { name: nameOf(clash.by) })"
          :description="t('payments.screens.till.linked.clash-help')"
          :actions="[
            { label: t('payments.screens.till.linked.keep-mine'), color: 'neutral', variant: 'outline', onClick: keepMine },
            { label: t('payments.screens.till.linked.keep-theirs', { name: nameOf(clash.by) }), onClick: () => { if (clash) void adopt(clash) } },
          ]"
        />
        <UAlert
          v-if="sale && saleBy"
          class="mb-6"
          color="info"
          variant="subtle"
          icon="i-lucide-link"
          :title="t('payments.screens.till.linked.sale-elsewhere', { name: nameOf(saleBy) })"
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
                  <!-- Someone who asks for a receipt after paying: one for the whole sale, or for one
                       person of a split one, sent once. -->
                  <p
                    v-if="finished.receiptSent"
                    class="flex items-center gap-2 text-sm text-muted"
                  >
                    <UIcon
                      name="i-lucide-mail-check"
                      class="size-4"
                    />{{ t('payments.screens.till.receipt-sent') }}
                  </p>
                  <UFormField
                    v-else-if="!finished.split"
                    :label="t('payments.screens.till.receipt-after')"
                    :hint="t('payments.screens.optional')"
                  >
                    <div class="flex gap-2">
                      <PaymentsReceiptTo
                        v-model="afterTo"
                        class="flex-1"
                        :disabled="sending"
                      />
                      <UButton
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-send"
                        :loading="sending"
                        :disabled="!afterTo"
                        :label="t('payments.screens.till.receipt-send')"
                        @click="sendAfter"
                      />
                    </div>
                  </UFormField>
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

              <div
                v-if="!sale && groups.length && addedDiscounts.length"
                class="flex flex-wrap items-center gap-2"
              >
                <UBadge
                  v-for="d in addedDiscounts"
                  :key="d.key"
                  color="neutral"
                  variant="subtle"
                  size="lg"
                  class="gap-1"
                >
                  {{ d.label }}
                  <IconButton
                    icon="i-lucide-x"
                    :label="t('payments.screens.till.discount-remove', { name: d.label })"
                    class="-me-1"
                    @click="d.remove()"
                  />
                </UBadge>
              </div>
              <div
                v-if="!sale && groups.length"
                class="space-y-3"
              >
                <UFormField
                  name="promoCode"
                  :label="t('payments.screens.till.discount-add')"
                  :ui="{ label: 'sr-only' }"
                  :error="pickedChoice?.needsReason ? undefined : discountRefusal?.reason"
                >
                  <div
                    v-if="pickedChoice?.needsReason"
                    class="flex items-center gap-2 rounded-md border border-default px-2.5 py-1.5 text-sm"
                  >
                    <UIcon
                      name="i-lucide-badge-percent"
                      class="size-5 shrink-0 text-dimmed"
                    />
                    <span class="flex-1">{{ pickedChoice.name }}</span>
                    <IconButton
                      icon="i-lucide-x"
                      :label="t('payments.screens.till.discount-remove', { name: pickedChoice.name })"
                      @click="clearDiscountBox"
                    />
                  </div>
                  <div
                    v-else
                    class="flex gap-2"
                  >
                    <UInputMenu
                      v-model="picked"
                      v-model:search-term="codeTyped"
                      :items="choiceItems"
                      value-key="value"
                      icon="i-lucide-ticket-percent"
                      :placeholder="t('payments.screens.till.discount-placeholder')"
                      :create-item="{ position: 'top', when: 'always' }"
                      :ignore-filter="false"
                      :ui="{ base: 'uppercase placeholder:normal-case' }"
                      class="min-w-0 flex-1"
                      autocomplete="off"
                      open-on-focus
                      :disabled="trying"
                      @focus="loadChoices"
                      @create="addCode"
                    >
                      <template #create-item-label="{ item }">
                        {{ t('payments.screens.till.discount-use-code', { code: String(item).toUpperCase() }) }}
                      </template>
                    </UInputMenu>
                    <UButton
                      color="neutral"
                      variant="outline"
                      :label="t('payments.screens.till.discount-apply')"
                      :loading="trying"
                      :disabled="!codeTyped.trim()"
                      @click="addCode()"
                    />
                  </div>
                </UFormField>
                <UForm
                  v-if="pickedChoice?.needsReason"
                  :state="{ reason }"
                  novalidate
                  @submit="addPicked"
                >
                  <UFormField
                    :label="t('payments.screens.till.discount-reason')"
                    name="reason"
                    required
                    :error="discountRefusal?.reason"
                  >
                    <div class="flex gap-2">
                      <UInput
                        v-model="reason"
                        maxlength="200"
                        class="min-w-0 flex-1"
                        autofocus
                      />
                      <UButton
                        type="submit"
                        color="neutral"
                        variant="outline"
                        :label="t('payments.screens.till.discount-give')"
                        :loading="trying"
                        :disabled="!reason.trim()"
                      />
                    </div>
                  </UFormField>
                </UForm>
              </div>

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

              <!-- The receipt for a sale that is not split, with any tickets on it: before paying, or
                   while it is being paid. A split sale has one for each person instead. -->
              <UFormField
                v-if="!isSplit && !splitting && (sale || groups.length) && methods.length && !waiting"
                :label="t('payments.screens.till.receipt-to')"
                :hint="receiptNeeded ? undefined : t('payments.screens.optional')"
                :required="receiptNeeded"
                :help="receiptNeeded && !receiptTo[0] ? t('payments.screens.till.receipt-needed') : undefined"
              >
                <PaymentsReceiptTo
                  v-model="receiptTo[0]"
                  :disabled="taking"
                />
              </UFormField>

              <!-- Splitting, before anything is taken: each item is given to a person, and each person
                   pays for their own. The basket stays as it is until someone pays. -->
              <template v-if="!sale && splitting && methods.length">
                <div class="space-y-2">
                  <p class="font-medium">
                    {{ t('payments.screens.till.split-title') }}
                  </p>
                  <p class="text-sm text-muted">
                    {{ t('payments.screens.till.split-help') }}
                  </p>
                  <ul class="divide-y divide-default">
                    <li
                      v-for="(u, i) in units"
                      :key="i"
                      class="flex items-center justify-between gap-3 py-2"
                    >
                      <span class="min-w-0 flex-1 truncate text-sm">{{ u.label }}</span>
                      <span class="text-sm tabular-nums text-muted">{{ money(u.amountMinor) }}</span>
                      <UFieldGroup
                        role="radiogroup"
                        :aria-label="t('payments.screens.till.give-to', { item: u.label })"
                      >
                        <UButton
                          v-for="n in people"
                          :key="n"
                          size="sm"
                          role="radio"
                          :aria-checked="owners[i] === n"
                          :aria-label="t('payments.screens.till.person', { n })"
                          :color="owners[i] === n ? 'primary' : 'neutral'"
                          :variant="owners[i] === n ? 'solid' : 'outline'"
                          :label="String(n)"
                          :disabled="taking"
                          @click="owners[i] = n"
                        />
                      </UFieldGroup>
                    </li>
                  </ul>
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="link"
                      icon="i-lucide-user-plus"
                      :disabled="taking || people >= units.length"
                      :label="t('payments.screens.till.add-person')"
                      @click="addPerson"
                    />
                    <UButton
                      v-if="people > 2"
                      size="sm"
                      color="neutral"
                      variant="link"
                      icon="i-lucide-user-minus"
                      :disabled="taking"
                      :label="t('payments.screens.till.remove-person', { n: people })"
                      @click="removePerson"
                    />
                  </div>
                </div>
                <PaymentsTillPeople
                  v-model:receipt-to="receiptTo"
                  :persons="persons"
                  :methods="methods"
                  :method-label="methodLabel"
                  :method-icon="methodIcon"
                  :busy="taking || !payable || planIncomplete || (receiptNeeded && persons.some(p => !receiptTo[p.position]))"
                  :paying="paying"
                  :money="money"
                  @pay="payPerson"
                />
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
                    <!-- One item cannot be split, so the button says why it is off. -->
                    <UTooltip
                      :text="t('payments.screens.till.split-one')"
                      :disabled="canSplit"
                    >
                      <UButton
                        block
                        size="lg"
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-split"
                        :disabled="!payable || taking || !canSplit"
                        :label="t('payments.screens.till.split')"
                        @click="startSplit(true)"
                      />
                    </UTooltip>
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
                <UButton
                  v-for="a in panelActions"
                  :key="a.key"
                  block
                  size="lg"
                  color="neutral"
                  variant="outline"
                  :icon="a.icon"
                  :loading="a.loading"
                  :disabled="taking || stale || summing"
                  :label="a.label"
                  @click="a.run"
                />
              </template>

              <div
                v-else-if="sale"
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

                  <!-- A split sale: each person pays for their own items, in any order. -->
                  <PaymentsTillPeople
                    v-if="isSplit && methods.length && !chosen"
                    v-model:receipt-to="receiptTo"
                    :persons="persons"
                    :methods="methods"
                    :method-label="methodLabel"
                    :method-icon="methodIcon"
                    :busy="taking"
                    :paying="paying"
                    :money="money"
                    @pay="payPerson"
                  />
                  <p
                    v-if="isSplit && chosen && payingFor"
                    class="font-medium"
                  >
                    {{ t('payments.screens.till.paying-for', { n: payingFor.position, amount: money(payingFor.amountMinor) }) }}
                  </p>

                  <!-- No way picked yet, or the last one is finished with: each is a button. -->
                  <div
                    v-if="methods.length && !chosen && !isSplit"
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
                      :disabled="taking"
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
                        <!-- Its room is kept while the box is empty, so the button below does not move under
                             the seller's finger as the amount handed over is entered. -->
                        <p
                          class="min-h-8 text-2xl font-semibold tabular-nums"
                          :class="change !== null && change < 0 ? 'text-error' : 'text-highlighted'"
                          aria-live="polite"
                        >
                          <template v-if="change !== null">
                            {{ change < 0 ? t('payments.screens.till.short', { amount: money(-change) }) : t('payments.screens.till.change-live', { amount: money(change) }) }}
                          </template>
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
                      v-if="needsReader(chosen)"
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
                        :disabled="(needsReader(chosen) && !readerId) || (chosen.method === 'cash' && change !== null && change < 0)"
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
                      v-if="methods.length > 1 || isSplit"
                      color="neutral"
                      variant="link"
                      icon="i-lucide-arrow-left"
                      :disabled="taking"
                      :label="t(isSplit ? 'payments.screens.till.back-to-people' : 'payments.screens.till.another-way')"
                      @click="choice = undefined; paying = null"
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

          <!-- While a payment is being taken nothing in the sale can change: the panels say so plainly. -->
          <UAlert
            v-if="sale"
            color="info"
            variant="subtle"
            icon="i-lucide-lock"
            class="mb-4"
            :title="t('payments.screens.till.in-progress', { amount: money(due) })"
            :description="t('payments.screens.till.in-progress-help')"
            :actions="paidInPart ? [] : [{ label: t('payments.screens.till.in-progress-cancel'), color: 'neutral', variant: 'outline', disabled: taking, onClick: cancel }]"
          />
          <div
            class="grid grid-cols-1 gap-6"
            :class="live ? 'min-[900px]:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]' : 'lg:grid-cols-[minmax(0,1fr)_22rem]'"
          >
            <!-- Every panel stays mounted, so a tab keeps what was put in it while another is shown. -->
            <UTabs
              v-if="tabbed"
              v-model="tab"
              :inert="!!sale"
              :class="sale ? 'opacity-40' : undefined"
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
              :class="sale ? 'opacity-40' : undefined"
              :inert="!!sale"
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
              :class="live ? 'hidden min-[900px]:sticky min-[900px]:top-16 min-[900px]:block min-[900px]:self-start' : 'hidden lg:sticky lg:top-4 lg:block lg:self-start'"
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
              :ui="{ body: sheetScrolls ? undefined : 'overflow-y-visible' }"
            >
              <template #body>
                <div ref="sheetBody">
                  <Receipt />
                </div>
              </template>
            </UDrawer>
          </template>
        </div>
      </template>
    </DataBoundary>
  </div>
</template>
