<!-- The bar's panel in the till (S2, and the till proposal of 17 November 2026): the outlet's products
     at its prices as tiles, a category at a time or all together. A product sold one way is added
     with one press; one with several sizes opens a window to pick the size. What is added goes on
     the till's receipt (the `receipt` event), where its steppers are, so the panel keeps no basket
     of its own on screen. The till adds the bar's lines to anything else being paid for and takes
     one payment; the bar sale is written only when payment starts. With `large` (the combined till
     in live mode) the tiles are bigger, for a phone or tablet.

     The first product that needs an age check asks "Does the customer look under 25?" once for the
     sale, and the answer stays on the receipt, where it can be changed. Refusing is one more press:
     the theatre's reasons are buttons, and the one pressed records the refusal. Before pressing,
     the seller says whether only the age-restricted lines are refused (the rest of the sale carries
     on, and the register ties the refusal to it) or the whole sale. A refusal can also be recorded
     with nothing in the sale. -->
<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'
import { answerVerdict, itemVerdict, type AllergenFacts, type Verdict } from '../../shared/allergen-verdict'

// The choice fields (`groupIds`, `baseMinor` and the menu's `groups`) are absent from a
// server without choices, and then every product is as it was: sizes only.
interface Item { variantId: string, productId: string, product: string, variant: string, ageRestricted: boolean, amountMinor: number, groupIds?: string[], baseMinor?: number, allergens?: Allergens }
/** What is recorded of the 14 allergens; absent while the theatre has allergens switched off. */
interface Allergens { contains: string[], mayContain: string[], checked: boolean, dependsOnChoice?: boolean }
interface Option { key: string, label: string, deltaMinor: number, ageRestricted: boolean, allergens?: Allergens }
interface Group { id: string, name: string, source: 'options' | 'mixers', required: boolean, maxPicks: number, defaultKey: string | null, options: Option[] }
interface Choice { groupId: string, key: string }
/** One line of the basket: a size, what was picked on it, and how many. */
interface Entry { key: string, item: Item, picks: Choice[], quantity: number, unitMinor: number, restricted: boolean }
interface Category { id: string, name: string, colour: string | null, parentId?: string | null, items: Item[] }
// `idTypes` and `refusalScope` arrive with the server's support for them; without them the prompt
// asks only whether ID was checked, and a refusal says nothing of its scope.
// `priceListStandard`, `priceListRestricted` and `priceListAllowed` say which list the till sells from
// and whether this seller may; `ageCheck.minimumAge` is the legal age, where the server sends it.
interface Menu { outletId: string, outlet: string, priceListId: string, priceList: string, priceListStandard?: boolean, priceListRestricted?: boolean, priceListAllowed?: boolean, tillLayout?: 'chips' | 'folders' | 'rail', favourites?: string[], allergenStatement?: string | null, categories: Category[], groups?: Group[], ageCheck: { enabled: boolean, challengeAge: number, minimumAge?: number, description: boolean, idTypes?: string[], refusalScope?: boolean } }
/** A product as one tile: its sizes, cheapest first as the server lists them. */
interface Tile { key: string, productId: string, name: string, items: Item[], ageRestricted: boolean, fromMinor: number, choices: boolean, colour: string | null }
interface Outlet { id: string, name: string, kind: string }

const props = defineProps<{ modelValue: unknown, locked: boolean, summary: { lines: { label: string, amountMinor: number }[], amountMinor: number } | null, large?: boolean, settled?: string | null }>()
const emit = defineEmits<{
  'update:modelValue': [unknown]
  /** The bar's lines for the till's receipt, the age answer to keep on it, and what was last added. */
  'receipt': [{ lines: { key: string, label: string, detail?: string, quantity: number, amountMinor: number, more: () => void, fewer: () => void }[], note: { text: string, icon: string, action: { label: string, run: () => void } } | null, added: { label: string, undo: () => void } | null }]
}>()

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const { time } = useDates()
const toast = useToast()

const DEVICE_OUTLET = 'bar.till.outlet'
const { data: places } = await useAPI<{ outlets: Outlet[] }>('/api/bar/till/outlets', { key: 'bar:till-outlets' })
const outletId = ref<string | undefined>(undefined)
onMounted(() => {
  let kept: string | null = null
  try {
    kept = localStorage.getItem(DEVICE_OUTLET)
  }
  catch {
    // Storage blocked: the first outlet is chosen.
  }
  const list = places.value?.outlets ?? []
  outletId.value = list.find(o => o.id === kept)?.id ?? list[0]?.id
})
const outletItems = computed(() => (places.value?.outlets ?? []).map(o => ({ value: o.id, label: o.name })))

const menu = ref<Menu | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(outletId, async (id) => {
  if (!id) return
  try {
    localStorage.setItem(DEVICE_OUTLET, id)
  }
  catch {
    // Storage blocked: the outlet is asked for again next time.
  }
  refusal.value = null
  try {
    menu.value = await $api<Menu>('/api/bar/till/menu', { query: { outlet: id } })
  }
  catch (e) {
    menu.value = null
    refusal.value = toRefusal(e)
  }
  if (!restore()) clear()
})

// The basket: a line a size and its choices, in the order they were first added. Different choices
// on the same size are different lines.
const basket = ref<Map<string, Entry>>(new Map())
const clientKey = ref<string>(crypto.randomUUID())
const groups = computed(() => new Map((menu.value?.groups ?? []).map(g => [g.id, g])))
const groupsOf = (i: Item) => (i.groupIds ?? []).flatMap(id => groups.value.get(id) ?? [])
const picked = (picks: Choice[]) => picks.flatMap(p => groups.value.get(p.groupId)?.options.find(o => o.key === p.key) ?? [])
const keyOf = (i: Item, picks: Choice[]) => [i.variantId, ...picks.map(p => `${p.groupId}:${p.key}`).sort()].join('|')
// The price of one, worked out as the server does: the size's price and what is picked on it.
// Promotions are the till's, shown at the foot of its receipt.
function unitOf(i: Item, picks: Choice[]) {
  return i.amountMinor + picked(picks).reduce((sum, o) => sum + o.deltaMinor, 0)
}
const needsAge = (i: Item, picks: Choice[]) => i.ageRestricted || picked(picks).some(o => o.ageRestricted)
const label = (i: Item) => i.variant === 'Each' ? i.product : `${i.product}, ${i.variant}`
const detailOf = (e: Pick<Entry, 'item' | 'picks'>) => [e.item.variant === 'Each' ? null : e.item.variant, ...picked(e.picks).map(o => o.label)].filter(Boolean).join(' · ')
const lines = computed(() => [...basket.value.values()])
const total = computed(() => lines.value.reduce((s, l) => s + l.unitMinor * l.quantity, 0))

// The seller's answer to the age prompt, asked once for the basket.
const answer = ref<'not_needed' | 'id_checked' | null>(null)
const idType = ref<string | null>(null)
const restricted = computed(() => lines.value.some(l => l.restricted))
const idTypes = computed(() => menu.value?.ageCheck.idTypes ?? [])
// What was last added, for the till's undo.
const last = ref<string | null>(null)

// The basket is kept in this tab's storage as it changes, so reloading the page (such as while a
// payment is being taken) brings it back with its key, its age answer and any refusal: the till then
// shows the sale's lines again, and paying carries on with the same bar sale.
const KEPT = 'bar.till.basket'
const KEEP_FOR = 2 * 60 * 60 * 1000 // not-policy: how long a basket left by a reload is brought back
interface Kept { at: number, outletId: string, clientKey: string, lines: { variantId: string, picks: Choice[], quantity: number }[], answer: typeof answer.value, idType: string | null, refused: { at: number, reason: string } | null, avoid: string[] }
let restored = false
function keep() {
  if (!menu.value) return
  const kept: Kept = { at: Date.now(), outletId: menu.value.outletId, clientKey: clientKey.value, lines: lines.value.map(l => ({ variantId: l.item.variantId, picks: l.picks, quantity: l.quantity })), answer: answer.value, idType: idType.value, refused: refused.value, avoid: avoid.value }
  try {
    sessionStorage.setItem(KEPT, JSON.stringify(kept))
  }
  catch {
    // Storage blocked: a reload starts an empty basket.
  }
}
/** Brings back the basket a reload left, once, when it is for this outlet and recent. */
function restore(): boolean {
  if (restored || !menu.value) return false
  restored = true
  let kept: Kept | null = null
  try {
    kept = JSON.parse(sessionStorage.getItem(KEPT) ?? 'null') as Kept | null
  }
  catch {
    return false
  }
  if (!kept || kept.outletId !== menu.value.outletId || Date.now() - kept.at > KEEP_FOR) return false
  const items = new Map(cats.value.flatMap(c => c.items.map(i => [i.variantId, i] as const)))
  const next = new Map<string, Entry>()
  for (const l of kept.lines) {
    const item = items.get(l.variantId)
    if (!item) continue
    const key = keyOf(item, l.picks)
    next.set(key, { key, item, picks: l.picks, quantity: l.quantity, unitMinor: unitOf(item, l.picks), restricted: needsAge(item, l.picks) })
  }
  basket.value = next
  clientKey.value = kept.clientKey
  answer.value = kept.answer
  idType.value = kept.idType
  refused.value = kept.refused
  avoid.value = kept.avoid ?? []
  send()
  return true
}

function undoLast() {
  const entry = last.value ? basket.value.get(last.value) : undefined
  last.value = null
  if (entry) set(entry, entry.quantity - 1)
}
function send() {
  const said = restricted.value && answer.value
  const lastEntry = last.value ? basket.value.get(last.value) : undefined
  keep()
  emit('receipt', {
    lines: lines.value.map(l => ({
      key: l.key,
      label: l.item.product,
      // Two or more of a line say what one costs.
      detail: [detailOf(l), l.quantity > 1 ? t('bar.desk.each', { count: l.quantity, amount: money(l.unitMinor) }) : ''].filter(Boolean).join(' · ') || undefined,
      quantity: l.quantity,
      amountMinor: l.unitMinor * l.quantity,
      more: () => set(l, l.quantity + 1),
      fewer: () => set(l, l.quantity - 1),
    })),
    note: said
      ? {
          text: answer.value === 'not_needed'
            ? t('bar.desk.answer.over', { age: menu.value?.ageCheck.challengeAge ?? 25 })
            : idType.value ? t('bar.desk.answer.id', { id: t(`bar.desk.id-types.${idType.value}`) }) : t('bar.desk.answer.checked'),
          icon: 'i-lucide-shield-check',
          action: { label: t('bar.desk.answer.change'), run: () => ask(null, 0) },
        }
      : null,
    added: lastEntry ? { label: label(lastEntry.item), undo: undoLast } : null,
  })
  if (!lines.value.length || !menu.value) return emit('update:modelValue', null)
  emit('update:modelValue', {
    outletId: menu.value.outletId,
    clientKey: clientKey.value,
    lines: lines.value.map(l => ({ variantId: l.item.variantId, quantity: l.quantity, ...(l.picks.length ? { choices: l.picks } : {}) })),
    expectedTotalMinor: total.value,
    ...(restricted.value && answer.value ? { ageCheck: answer.value, ...(answer.value === 'id_checked' && idType.value && idTypes.value.length ? { idType: idType.value } : {}) } : {}),
  })
}

// The prompt: opened by the first line that needs an age check (the product itself, or something
// picked on it), holding what to add once answered; or from the receipt to change the answer.
const prompt = ref<{ entry: Entry | null, quantity: number } | null>(null)
function ask(entry: Entry | null, quantity: number) {
  prompt.value = { entry, quantity }
}
function needsPrompt(entry: Entry, quantity: number): boolean {
  if (!menu.value?.ageCheck.enabled || !entry.restricted || answer.value || quantity <= 0) return false
  ask(entry, quantity)
  return true
}
function answerPrompt(outcome: 'not_needed' | 'id_checked', shown: string | null = null) {
  const pending = prompt.value!
  prompt.value = null
  answer.value = outcome
  idType.value = shown
  if (pending.entry) set(pending.entry, pending.quantity)
  else send()
}

// A refusal: from the prompt (the product that raised it) or from the button above the tiles, with
// or without anything in the sale. The reason pressed records it at once.
const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/bar.refusal-reason/terms', { key: 'bar:refusal-reasons', default: () => ({ terms: [] }) })
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
const refusing = ref<{ entry: Entry | null, scope: 'restricted' | 'all', description: string, from: 'prompt' | 'panel', pending: { entry: Entry | null, quantity: number } | null } | null>(null)
const refusalProblem = ref<ReturnType<typeof toRefusal> | null>(null)
// A refusal stands for the customer until the seller starts a new one (or their sale is paid): while it
// does, nothing age-restricted can be added, so the prompt cannot be answered the other way a moment later.
const refused = ref<{ at: number, reason: string } | null>(null)
const saving = ref(false)
const describe = (text: string) => menu.value?.ageCheck.description && text.trim() ? text.trim() : null
const restrictedNames = computed(() => [...new Set([refusing.value?.entry, ...lines.value].flatMap(e => e?.restricted ? [label(e.item)] : []))].join(', '))
// The choice of what is refused is offered when the sale holds something that would carry on.
const scoped = computed(() => lines.value.length > 0 && (restricted.value || !!refusing.value?.entry?.restricted))

function refuseFromPrompt() {
  const p = prompt.value
  prompt.value = null
  refusing.value = { entry: p?.entry ?? lines.value.find(l => l.restricted) ?? null, scope: 'restricted', description: '', from: 'prompt', pending: p }
  refusalProblem.value = null
}
function refuseFromPanel() {
  // Only an age-restricted line is recorded as the product refused: a sale of soft drinks refused
  // whole names no product.
  const first = lines.value.find(l => l.restricted) ?? null
  refusing.value = { entry: first, scope: first ? 'restricted' : 'all', description: '', from: 'panel', pending: null }
  refusalProblem.value = null
}
function backToPrompt() {
  const r = refusing.value
  refusing.value = null
  if (r?.pending) prompt.value = r.pending
}
async function refuse(reasonTermId: string) {
  const r = refusing.value
  if (!r || !menu.value) return
  // Only the restricted lines: the rest of the sale carries on, and the register ties the refusal
  // to it by the basket's key. The whole sale: nothing carries on, so there is nothing to tie it to.
  const carriesOn = scoped.value && r.scope === 'restricted'
  saving.value = true
  refusalProblem.value = null
  try {
    await $api('/api/bar/age-checks/refusals', {
      method: 'POST',
      body: {
        outletId: menu.value.outletId,
        variantId: r.entry?.restricted ? r.entry.item.variantId : null,
        reasonTermId,
        description: describe(r.description),
        ...(carriesOn ? { basketKey: clientKey.value } : {}),
        ...(menu.value.ageCheck.refusalScope && lines.value.length ? { scope: carriesOn ? 'restricted' : 'all' } : {}),
      },
    })
    refusing.value = null
    last.value = null
    refused.value = { at: Date.now(), reason: reasonItems.value.find(x => x.value === reasonTermId)?.label ?? '' }
    if (carriesOn) {
      basket.value = new Map([...basket.value].filter(([, e]) => !e.restricted))
      answer.value = null
      idType.value = null
      send()
    }
    else if (lines.value.length) {
      // Refusing the whole sale empties it, and the next basket is a new one.
      clear()
      clientKey.value = crypto.randomUUID()
    }
    toast.add({ id: 'bar-till', title: t('bar.desk.refusal-recorded'), description: carriesOn ? t('bar.desk.refusal-carries-on') : undefined, color: 'success' })
  }
  catch (e) {
    refusalProblem.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}

function set(entry: Entry, quantity: number) {
  if (props.locked) return
  const had = basket.value.get(entry.key)?.quantity ?? 0
  if (quantity > had && entry.restricted && refused.value) {
    toast.add({ id: 'bar-till', title: t('bar.desk.refused.blocked'), description: t('bar.desk.refused.help'), color: 'error', icon: 'i-lucide-ban' })
    return
  }
  if (!had && needsPrompt(entry, quantity)) return
  const next = new Map(basket.value)
  if (quantity <= 0) next.delete(entry.key)
  else next.set(entry.key, { ...entry, quantity: Math.min(quantity, 99) }) // not-policy: one line's quantity, as the server caps it
  basket.value = next
  if (quantity > had) last.value = entry.key
  else if (last.value === entry.key) last.value = null
  if (!restricted.value) {
    answer.value = null
    idType.value = null
  }
  send()
}
function add(i: Item, picks: Choice[] = []) {
  const key = keyOf(i, picks)
  const entry = basket.value.get(key) ?? { key, item: i, picks, quantity: 0, unitMinor: unitOf(i, picks), restricted: needsAge(i, picks) }
  set(entry, entry.quantity + 1)
}
function clear() {
  avoid.value = []
  basket.value = new Map()
  answer.value = null
  idType.value = null
  last.value = null
  send()
}
// The till empties every panel after a payment or when the sale is cleared: start a new basket,
// with a new key. A paid sale (the till was locked while it was taken) ends the customer, and with
// them any refusal; clearing the sale by hand does not.
watch(() => [props.modelValue, props.locked] as const, ([value], [, wasLocked]) => {
  if (value !== null) return
  if (wasLocked) refused.value = null
  if (basket.value.size) {
    clientKey.value = crypto.randomUUID()
    clear()
  }
})
/** The seller says the refused customer has gone: the refusal stops standing and a new basket starts. */
function newCustomer() {
  refused.value = null
  clientKey.value = crypto.randomUUID()
  clear()
}

// One tile a product. A product sold one way with nothing to choose is added by its tile; one with
// several sizes opens the size window; one with choices opens the choice window, sizes at its top.
const colourOf = (c: Category) => c.colour ?? cats.value.find(p => p.id === c.parentId)?.colour ?? null
const tileOf = (key: string, name: string, c: Category): Tile => ({ key, productId: '', name, items: [], ageRestricted: false, fromMinor: Infinity, choices: false, colour: colourOf(c) })
function grow(tile: Tile, i: Item) {
  tile.productId = i.productId
  tile.items.push(i)
  tile.ageRestricted ||= i.ageRestricted || groupsOf(i).some(g => g.options.some(o => o.ageRestricted))
  tile.fromMinor = Math.min(tile.fromMinor, i.amountMinor)
  tile.choices ||= groupsOf(i).length > 0
}
const tiles = (c: Category): Tile[] => {
  const byProduct = new Map<string, Tile>()
  for (const i of c.items) {
    const tile = byProduct.get(i.productId) ?? tileOf(i.productId, i.product, c)
    grow(tile, i)
    byProduct.set(i.productId, tile)
  }
  return [...byProduct.values()]
}
const inSale = (tile: Tile) => lines.value.reduce((n, l) => n + (l.item.productId === tile.productId ? l.quantity : 0), 0)
const sizing = ref<Tile | null>(null)
/** A product that is age-restricted in every size cannot be added while a refusal stands. */
const barred = (tile: Tile) => !!refused.value && tile.items.every(i => i.ageRestricted)

// The choice window. The usual choice is picked already, so the common order is one more press.
const SHORT = 6 // not-policy: how many options a group shows before "More"
const choosing = ref<{ tile: Tile, item: Item, picks: Choice[], open: Record<string, boolean>, search: Record<string, string> } | null>(null)
/**
 * The usual choice of each group, picked already. While the customer's allergens are recorded, one
 * that contains, may contain or was never checked for something they avoid is never picked for them
 * (the shared verdict, as the public chart judges it): a required group starts on the first option
 * with none of it listed, or on nothing, so the seller picks; an optional one starts on nothing.
 */
const defaults = (i: Item): Choice[] => groupsOf(i).flatMap((g) => {
  const usual = g.options.find(o => o.key === g.defaultKey)
  if (!usual) return []
  if (fits(usual)) return [{ groupId: g.id, key: usual.key }]
  const instead = g.required ? g.options.find(fits) : undefined
  return instead ? [{ groupId: g.id, key: instead.key }] : []
})
// Nor is anything age-restricted picked while a refusal stands.
const fits = (o: Option) => (!avoid.value.length || answerVerdict(avoid.value, facts(o.allergens)).kind === 'none-listed') && !(refused.value && o.ageRestricted)
/** What the choice window says about what is picked: the usual choice, or why it was left out. */
function choiceHelp(i: Item): string {
  const passedOver = groupsOf(i).map(g => g.options.find(o => o.key === g.defaultKey)).filter((o): o is Option => !!o && !fits(o))
  if (!passedOver.length) return t('bar.desk.choices.help')
  return t(passedOver.some(o => refused.value && o.ageRestricted) ? 'bar.desk.choices.help-refused' : 'bar.desk.choices.help-avoided')
}
function press(tile: Tile) {
  const first = tile.items[0]!
  if (tile.choices) choosing.value = { tile, item: first, picks: defaults(first), open: {}, search: {} }
  else if (tile.items.length === 1) add(first)
  else sizing.value = tile
}
function pick(i: Item) {
  sizing.value = null
  add(i)
}
function resize(i: Item) {
  const c = choosing.value!
  // A size may offer other groups: keep the picks it still offers, and its defaults for the rest.
  const kept = c.picks.filter(p => (i.groupIds ?? []).includes(p.groupId))
  c.picks = [...kept, ...defaults(i).filter(d => !kept.some(p => p.groupId === d.groupId))]
  c.item = i
}
const isPicked = (g: Group, o: Option) => !!choosing.value?.picks.some(p => p.groupId === g.id && p.key === o.key)
function toggle(g: Group, o: Option) {
  const c = choosing.value!
  const mine = c.picks.filter(p => p.groupId === g.id)
  const others = c.picks.filter(p => p.groupId !== g.id)
  if (mine.some(p => p.key === o.key)) {
    // A required group of one always holds a pick.
    if (g.required && mine.length === 1) return
    c.picks = [...others, ...mine.filter(p => p.key !== o.key)]
  }
  else if (g.maxPicks === 1) c.picks = [...others, { groupId: g.id, key: o.key }]
  else if (mine.length < g.maxPicks) c.picks = [...c.picks, { groupId: g.id, key: o.key }]
}
/** The options a group shows: all of a short one; of a long one the first few, with what is picked, until "More" or a search. */
function shownOptions(g: Group): Option[] {
  const c = choosing.value!
  if (g.options.length <= SHORT) return g.options
  if (!c.open[g.id]) {
    const chosen = g.options.filter(o => isPicked(g, o))
    return [...chosen, ...g.options.filter(o => !chosen.includes(o))].slice(0, Math.max(SHORT - 1, chosen.length))
  }
  const q = (c.search[g.id] ?? '').trim().toLowerCase()
  return q ? g.options.filter(o => o.label.toLowerCase().includes(q)) : g.options
}
const missing = computed(() => !!choosing.value && groupsOf(choosing.value.item).some(g => g.required && !choosing.value!.picks.some(p => p.groupId === g.id)))
function addChosen() {
  const c = choosing.value!
  if (missing.value) return
  choosing.value = null
  add(c.item, c.picks)
}

// How the tiles are laid out is the outlet's choice (till proposal, 17 November 2026): category
// chips over everything, folders to open with the outlet's favourites in front, or a list of
// categories down the side. A category may hold one level of sub-categories.
interface Section { id: string, heading: string | null, colour: string | null, tiles: Tile[] }
// The tile is a prop of the template, not an attribute to pass on to the button.
const [DefineTile, TileButton] = createReusableTemplate<{ tile: Tile }>({ inheritAttrs: false })
const layout = computed(() => menu.value?.tillLayout ?? 'chips')
const cats = computed(() => menu.value?.categories ?? [])
const subsOf = (c: Category) => cats.value.filter(s => s.parentId === c.id && s.items.length)
const isTop = (c: Category) => !c.parentId || !cats.value.some(p => p.id === c.parentId)
const tops = computed(() => cats.value.filter(c => isTop(c) && (c.items.length || subsOf(c).length)))
const productsIn = (c: Category) => tiles(c).length + subsOf(c).reduce((n, s) => n + tiles(s).length, 0)
/** A category as sections: its own tiles, then each sub-category under "Category › Sub". */
function sectionsOf(c: Category, headed: boolean): Section[] {
  return [
    ...(c.items.length ? [{ id: c.id, heading: headed ? c.name : null, colour: colourOf(c), tiles: tiles(c) }] : []),
    ...subsOf(c).map(s => ({ id: s.id, heading: `${c.name} › ${s.name}`, colour: colourOf(s), tiles: tiles(s) })),
  ]
}
// Chips and the side list: which category is in view. Folders: the folder opened, and one inside it.
// The outlet's favourites come first in every layout, and are what the till opens on.
const category = ref<string>('all')
const path = ref<string[]>([])
watch(menu, () => {
  category.value = menu.value?.favourites?.length ? 'favourites' : 'all'
  path.value = []
})
const current = computed(() => (category.value === 'favourites' ? null : tops.value.find(c => c.id === (layout.value === 'rail' && category.value === 'all' ? tops.value[0]?.id : category.value)) ?? null))
const folder = computed(() => tops.value.find(c => c.id === path.value[0]) ?? null)
const subFolder = computed(() => (folder.value ? subsOf(folder.value).find(s => s.id === path.value[1]) ?? null : null))
// The sizes pinned to the front of this outlet's till, each a tile of its own.
const favourites = computed<Tile[]>(() => (menu.value?.favourites ?? []).flatMap((variantId) => {
  for (const c of cats.value) {
    const item = c.items.find(i => i.variantId === variantId)
    if (!item) continue
    const tile = tileOf(`favourite:${variantId}`, label(item), c)
    grow(tile, item)
    return [tile]
  }
  return []
}))
// A search over every product, its sizes and what can be picked on it, whatever is in view.
const query = ref('')
const searching = ref(false)
const q = computed(() => query.value.trim().toLowerCase())
const matches = (tile: Tile) => [tile.name, ...tile.items.flatMap(i => [i.variant, ...groupsOf(i).flatMap(g => g.options.map(o => o.label))])].some(text => text.toLowerCase().includes(q.value))
const found = computed(() => (q.value ? cats.value.flatMap(c => tiles(c)).filter(matches) : []))
const favouritesSection = computed<Section[]>(() => (favourites.value.length ? [{ id: 'favourites', heading: t('bar.desk.favourites'), colour: null, tiles: favourites.value }] : []))
const sections = computed<Section[]>(() => {
  if (q.value) return found.value.length ? [{ id: 'search', heading: t('bar.desk.search.results', { count: found.value.length }), colour: null, tiles: found.value }] : []
  if (layout.value !== 'folders' && category.value === 'favourites') return favouritesSection.value
  if (layout.value === 'folders') {
    if (subFolder.value) return [{ id: subFolder.value.id, heading: null, colour: colourOf(subFolder.value), tiles: tiles(subFolder.value) }]
    if (folder.value) return folder.value.items.length ? [{ id: folder.value.id, heading: null, colour: colourOf(folder.value), tiles: tiles(folder.value) }] : []
    return favouritesSection.value
  }
  if (current.value) return sectionsOf(current.value, false)
  return tops.value.flatMap(c => sectionsOf(c, tops.value.length > 1))
})
/** The folders to open from where the seller is: categories at the front, sub-categories inside one. */
const folders = computed(() => {
  if (layout.value !== 'folders' || subFolder.value || q.value) return []
  if (folder.value) return subsOf(folder.value).map(s => ({ id: s.id, name: s.name, colour: colourOf(s), count: tiles(s).length, open: () => { path.value = [folder.value!.id, s.id] } }))
  return tops.value.map(c => ({ id: c.id, name: c.name, colour: colourOf(c), count: productsIn(c), open: () => { path.value = [c.id] } }))
})
// Nuxt UI has no --ui-neutral, so a category coloured neutral is drawn grey.
const shade = (colour: string) => (colour === 'neutral' ? 'var(--ui-color-neutral-400)' : `var(--ui-${colour})`)
const dot = (colour: string | null) => ({ backgroundColor: colour ? shade(colour) : 'var(--ui-border-accented)' })

// Allergens: what the customer avoids is tapped once and kept for the sale. A product is never
// called free of anything: at best nothing of what they avoid is recorded for it.
const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']
const hasAllergens = computed(() => cats.value.some(c => c.items.some(i => i.allergens)))
const allergensOpen = ref(false)
const avoid = ref<string[]>([])
const avoids = (key: string) => avoid.value.includes(key)
function toggleAvoid(key: string) {
  avoid.value = avoids(key) ? avoid.value.filter(k => k !== key) : [...avoid.value, key]
}
const names = (keys: string[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')
const hit = (keys: string[]) => keys.filter(k => !avoid.value.length || avoids(k))
type Tone = 'error' | 'warning' | 'success' | 'neutral'
const TONE_ICONS: Record<Tone, string> = { error: 'i-lucide-octagon-alert', warning: 'i-lucide-triangle-alert', success: 'i-lucide-check', neutral: 'i-lucide-circle-help' }
/**
 * What to say of a product, judged on every one of its sizes, against what the
 * customer avoids (everything when nothing is picked). Something recorded in any size counts, and a
 * size not checked leaves the product not checked.
 */
function verdict(list: (Allergens | undefined)[]): { tone: Tone, text: string, short: string } {
  const checked = list.filter((a): a is Allergens => !!a?.checked)
  const contains = [...new Set(checked.flatMap(a => hit(a.contains)))]
  const may = [...new Set(checked.flatMap(a => hit(a.mayContain)))].filter(k => !contains.includes(k))
  if (contains.length) return { tone: 'error', short: t('bar.desk.allergens.contains', { names: names(contains) }), text: [t('bar.desk.allergens.contains', { names: names(contains) }), may.length ? t('bar.desk.allergens.may-contain', { names: names(may) }) : ''].filter(Boolean).join(' ') }
  if (may.length) return { tone: 'warning', short: t('bar.desk.allergens.may-contain', { names: names(may) }), text: t('bar.desk.allergens.may-contain', { names: names(may) }) }
  if (!list.length || checked.length < list.length) return { tone: 'neutral', short: t('bar.desk.allergens.tile-not-checked'), text: t('bar.desk.allergens.not-checked') }
  if (checked.some(a => a.dependsOnChoice)) return { tone: 'warning', short: t('bar.desk.allergens.tile-depends'), text: t('bar.desk.allergens.depends') }
  return { tone: 'success', short: '', text: avoid.value.length ? t('bar.desk.allergens.none-of-these') : t('bar.desk.allergens.none') }
}
/** The products the sheet lists: those in view, or all of them from the front of the till. */
const allergenRows = computed(() => {
  const inView = layout.value === 'folders' ? (subFolder.value ? [subFolder.value] : folder.value ? [folder.value, ...subsOf(folder.value)] : null) : current.value ? [current.value, ...subsOf(current.value)] : null
  return (inView ?? cats.value).flatMap(c => tiles(c)).map(tile => ({ key: tile.key, name: tile.name, ...verdict(tile.items.map(i => i.allergens)) }))
})
/** An answer as the shared verdict takes it: none recorded is not checked. */
const facts = (a: Allergens | undefined): AllergenFacts => a ?? { contains: [], mayContain: [], checked: false }
// Worst first, to judge a product on every one of its sizes.
const WORST: Verdict['kind'][] = ['contains', 'not-checked', 'may-contain', 'depends', 'none-listed']
/**
 * While the customer's allergens are recorded, a tile says what it holds of them, so the sheet need
 * not stay open. Each size is judged by the shared verdict (the public chart's), with what can be
 * picked on it, and the tile takes the worst: red for contains, amber for may contain, depends on
 * what is picked, or never checked. Nothing is said of a tile with none of it listed.
 */
function mark(tile: Tile): { tone: Tone, text: string, icon: string } | null {
  if (!avoid.value.length || !hasAllergens.value) return null
  const verdicts = tile.items.flatMap(i => itemVerdict(avoid.value, { ...facts(i.allergens), dependsOnChoice: i.allergens?.dependsOnChoice }, groupsOf(i).map(g => ({ group: g.name, options: g.options.map(o => ({ label: o.label, allergens: facts(o.allergens) })) }))) ?? [])
  const kind = WORST.find(k => verdicts.some(v => v.kind === k))
  if (!kind || kind === 'none-listed') return null
  const hit = [...new Set(verdicts.filter(v => v.kind === kind).flatMap(v => v.hit))]
  const tone: Tone = kind === 'contains' ? 'error' : 'warning'
  const text = kind === 'contains'
    ? t('bar.desk.allergens.contains', { names: names(hit) })
    : kind === 'may-contain'
      ? t('bar.desk.allergens.may-contain', { names: names(hit) })
      : kind === 'depends' ? t('bar.desk.allergens.tile-depends') : t('bar.desk.allergens.tile-not-checked')
  return { tone, text, icon: kind === 'not-checked' ? TONE_ICONS.neutral : TONE_ICONS[tone] }
}
const RINGS: Record<Tone, string> = { error: 'ring-2 ring-error', warning: 'ring-2 ring-warning', neutral: 'ring-2 ring-warning', success: '' }
const MARK_TEXT: Record<Tone, string> = { error: 'text-error', warning: 'text-warning', neutral: 'text-warning', success: '' }
/** In the choice window: an option that holds something the customer avoids, or was never checked, says so. */
function warns(o: Option): { tone: 'error' | 'warning', text: string } | null {
  if (!avoid.value.length || !hasAllergens.value) return null
  const v = answerVerdict(avoid.value, facts(o.allergens))
  if (v.kind === 'contains') return { tone: 'error', text: t('bar.desk.allergens.contains', { names: names(v.hit) }) }
  if (v.kind === 'may-contain') return { tone: 'warning', text: t('bar.desk.allergens.may-contain', { names: names(v.hit) }) }
  return v.kind === 'not-checked' ? { tone: 'warning', text: t('bar.desk.allergens.tile-not-checked') } : null
}
// What the customer avoids and any refusal are kept with the basket, for a reload.
watch([avoid, refused], keep, { deep: true })
</script>

<template>
  <div class="space-y-4">
    <RefusalNotice :refusal="refusal" />
    <p
      v-if="places && !places.outlets.length"
      class="text-sm text-muted"
    >
      {{ t('bar.desk.no-outlet') }}
    </p>
    <!-- One line, even on a phone: where the till sells and at what prices, then search and the sheets,
         which drop to their icons where there is no room. -->
    <div
      v-else
      class="flex min-w-0 items-center gap-2"
    >
      <USelect
        v-if="outletItems.length > 1"
        v-model="outletId"
        :items="outletItems"
        :disabled="locked || lines.length > 0"
        :aria-label="t('bar.desk.outlet')"
        icon="i-lucide-store"
        class="min-w-0 max-w-[45%] sm:max-w-none sm:min-w-40"
      />
      <UBadge
        v-if="menu && menu.priceListStandard === false"
        :color="menu.priceListAllowed === false ? 'error' : 'info'"
        variant="subtle"
        icon="i-lucide-tags"
        class="min-w-0"
        :ui="{ label: 'truncate' }"
        :label="t('bar.desk.price-list', { name: menu.priceList })"
      />
      <div class="ms-auto flex shrink-0 items-center gap-1">
        <SearchToggle
          v-if="menu && tops.length"
          v-model="query"
          v-model:open="searching"
          :label="t('bar.desk.search.label')"
        />
        <UButton
          v-if="hasAllergens"
          color="neutral"
          variant="ghost"
          icon="i-lucide-wheat"
          :ui="{ label: 'max-sm:sr-only' }"
          :label="avoid.length ? t('bar.desk.allergens.button-avoiding', { count: avoid.length }) : t('bar.desk.allergens.button')"
          @click="allergensOpen = true"
        />
        <UButton
          v-if="menu?.ageCheck.enabled"
          color="neutral"
          variant="ghost"
          icon="i-lucide-ban"
          :ui="{ label: 'max-sm:sr-only' }"
          :label="lines.length ? t('bar.desk.refuse-sale') : t('bar.desk.record-refusal')"
          :disabled="locked"
          @click="refuseFromPanel()"
        />
      </div>
    </div>
    <UAlert
      v-if="menu?.priceListAllowed === false"
      color="warning"
      variant="subtle"
      icon="i-lucide-lock"
      :title="t('bar.desk.price-list-not-yours', { name: menu.priceList })"
      :description="t('bar.desk.price-list-not-yours-help')"
    />

    <UAlert
      v-if="refused"
      color="error"
      variant="subtle"
      icon="i-lucide-ban"
      :title="refused.reason ? t('bar.desk.refused.title', { time: time(refused.at), reason: refused.reason }) : t('bar.desk.refused.title-plain', { time: time(refused.at) })"
      :description="t('bar.desk.refused.help')"
      :actions="[{ label: t('bar.desk.refused.new-customer'), color: 'neutral', variant: 'outline', icon: 'i-lucide-user-round-plus', onClick: newCustomer }]"
      role="status"
    />

    <template v-if="menu">
      <DefineTile v-slot="{ tile }">
        <div class="relative h-full">
          <UButton
            color="neutral"
            variant="outline"
            block
            class="h-full flex-col items-stretch gap-1 text-start"
            :class="[large ? 'min-h-20 xl:min-h-24 xl:text-lg' : 'min-h-16', inSale(tile) ? 'bg-elevated' : '', RINGS[mark(tile)?.tone ?? 'success']]"
            :disabled="locked || barred(tile)"
            :aria-haspopup="tile.items.length > 1 || tile.choices ? 'dialog' : undefined"
            :title="tile.name"
            @click="press(tile)"
          >
            <span class="line-clamp-2 font-medium break-words">{{ tile.name }}</span>
            <span
              v-if="mark(tile)"
              class="flex items-start gap-1 text-xs font-medium"
              :class="MARK_TEXT[mark(tile)!.tone]"
            >
              <UIcon
                :name="mark(tile)!.icon"
                class="mt-px size-3.5 shrink-0"
              />
              <span class="line-clamp-2 min-w-0 break-words">{{ mark(tile)!.text }}</span>
            </span>
            <span class="mt-auto flex items-center gap-2 text-sm font-normal text-muted">
              <span class="whitespace-nowrap tabular-nums">{{ tile.items.length > 1 ? t('bar.desk.from', { amount: money(tile.fromMinor) }) : money(tile.fromMinor) }}</span>
              <span
                v-if="barred(tile)"
                class="ms-auto inline-flex items-center gap-1 text-xs font-medium text-error"
              >
                <UIcon
                  name="i-lucide-ban"
                  class="size-3.5"
                />{{ t('bar.desk.refused.tile') }}
              </span>
              <template v-else>
                <UIcon
                  v-if="tile.items.length > 1 || tile.choices"
                  name="i-lucide-ellipsis"
                  class="ms-auto size-4 shrink-0"
                /><span
                  v-if="tile.items.length > 1 || tile.choices"
                  class="sr-only"
                >{{ tile.items.length > 1 ? t('bar.desk.sizes', { count: tile.items.length }) : t('bar.desk.choose') }}</span>
                <span
                  v-if="tile.ageRestricted && menu.ageCheck.enabled"
                  class="shrink-0 text-xs font-semibold text-warning tabular-nums"
                  :class="tile.items.length > 1 || tile.choices ? '' : 'ms-auto'"
                ><span aria-hidden="true">{{ menu.ageCheck.challengeAge }}+</span><span class="sr-only">{{ t('bar.desk.age-check') }}</span></span>
              </template>
            </span>
          </UButton>
          <!-- How many are in the sale, large enough to read across the bar. -->
          <span
            v-if="inSale(tile) > 0"
            class="pointer-events-none absolute -end-1.5 -top-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-1.5 text-sm font-semibold text-inverted tabular-nums shadow-sm"
          ><span aria-hidden="true">{{ inSale(tile) }}</span><span class="sr-only">{{ t('bar.desk.in-sale', { count: inSale(tile) }) }}</span></span>
        </div>
      </DefineTile>

      <p
        v-if="!tops.length"
        class="text-sm text-muted"
      >
        {{ t('bar.desk.empty-menu') }}
      </p>

      <!-- Folders: where the seller is, and the way back. -->
      <nav
        v-if="layout === 'folders' && folder"
        :aria-label="t('bar.desk.categories')"
        class="flex flex-wrap items-center gap-2"
      >
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-left"
          :size="large ? 'lg' : 'md'"
          :label="t('bar.desk.prompt.back')"
          @click="path = path.slice(0, -1)"
        />
        <UButton
          color="neutral"
          variant="link"
          :label="t('bar.desk.tab')"
          @click="path = []"
        />
        <span class="text-muted">›</span>
        <UButton
          v-if="subFolder"
          color="neutral"
          variant="link"
          :label="folder.name"
          @click="path = [folder.id]"
        />
        <span
          v-else
          class="font-medium"
          aria-current="page"
        >{{ folder.name }}</span>
        <template v-if="subFolder">
          <span class="text-muted">›</span>
          <span
            class="font-medium"
            aria-current="page"
          >{{ subFolder.name }}</span>
        </template>
      </nav>

      <div :class="layout === 'rail' && (tops.length > 1 || favourites.length) && !q ? 'gap-4 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:items-start' : undefined">
        <!-- Chips over the tiles, or the same categories as a list down the side where there is room. -->
        <div
          v-if="layout !== 'folders' && (tops.length > 1 || favourites.length) && !q"
          role="group"
          :aria-label="t('bar.desk.categories')"
          class="mb-4 flex gap-2 overflow-x-auto pe-8 pb-1"
          :class="layout === 'rail' ? 'max-md:[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] md:sticky md:top-20 md:mb-0 md:flex-col md:overflow-visible md:pe-0 md:pb-0' : '[mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]'"
        >
          <UButton
            v-if="favourites.length"
            color="neutral"
            :variant="category === 'favourites' ? 'solid' : 'soft'"
            :aria-pressed="category === 'favourites'"
            class="shrink-0"
            :class="layout === 'rail' ? 'md:justify-start' : undefined"
            :size="large ? 'lg' : 'md'"
            icon="i-lucide-star"
            :label="t('bar.desk.favourites')"
            @click="category = 'favourites'"
          />
          <UButton
            v-if="layout === 'chips'"
            color="neutral"
            :variant="category === 'all' ? 'solid' : 'soft'"
            :aria-pressed="category === 'all'"
            class="shrink-0"
            :size="large ? 'lg' : 'md'"
            :label="t('bar.desk.all')"
            @click="category = 'all'"
          />
          <UButton
            v-for="c in tops"
            :key="c.id"
            color="neutral"
            :variant="category !== 'favourites' && current?.id === c.id ? 'solid' : 'soft'"
            :aria-pressed="category !== 'favourites' && current?.id === c.id"
            class="shrink-0"
            :class="layout === 'rail' ? 'md:justify-start' : undefined"
            :size="large ? 'lg' : 'md'"
            @click="category = c.id"
          >
            <span
              class="size-2.5 shrink-0 rounded-full"
              :style="dot(colourOf(c))"
            />{{ c.name }}
          </UButton>
        </div>

        <div class="min-w-0 space-y-4">
          <section
            v-for="s in sections"
            :key="s.id"
            class="space-y-2"
            :aria-label="s.heading ?? undefined"
          >
            <h3
              v-if="s.heading"
              class="flex items-center gap-1.5 text-sm font-medium text-muted"
            >
              <UIcon
                v-if="s.id === 'favourites'"
                name="i-lucide-star"
                class="size-4"
              />
              <span
                v-else
                class="size-2.5 rounded-full"
                :style="dot(s.colour)"
              />{{ s.heading }}
            </h3>
            <div
              class="grid auto-rows-fr gap-2"
              :class="large ? 'grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]'"
            >
              <TileButton
                v-for="tile in s.tiles"
                :key="tile.key"
                :tile="tile"
              />
            </div>
          </section>

          <p
            v-if="q && !found.length"
            class="text-sm text-muted"
          >
            {{ t('bar.desk.search.none') }}
          </p>

          <section
            v-if="folders.length"
            class="space-y-2"
            :aria-label="t('bar.desk.folders')"
          >
            <h3
              v-if="!folder"
              class="text-sm font-medium text-muted"
            >
              {{ t('bar.desk.folders') }}
            </h3>
            <div
              class="grid auto-rows-fr gap-2"
              :class="large ? 'grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]'"
            >
              <UButton
                v-for="f in folders"
                :key="f.id"
                color="neutral"
                variant="soft"
                block
                class="h-full flex-col items-stretch justify-between gap-1 text-start"
                :class="large ? 'min-h-20' : 'min-h-16'"
                @click="f.open()"
              >
                <span class="flex items-center gap-2 font-medium">
                  <UIcon
                    name="i-lucide-folder"
                    class="size-4 shrink-0"
                    :style="f.colour ? { color: shade(f.colour) } : undefined"
                  />
                  <span class="line-clamp-2 min-w-0 break-words">{{ f.name }}</span>
                </span>
                <span class="flex items-center justify-between text-sm font-normal text-muted">
                  {{ t('bar.desk.folder-count', { count: f.count }) }}
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-4"
                  />
                </span>
              </UButton>
            </div>
          </section>
        </div>
      </div>
    </template>

    <!-- The allergens sheet: tap what the customer avoids, and each product in view says where it stands. -->
    <UModal
      v-model:open="allergensOpen"
      :title="t('bar.desk.allergens.title')"
      :description="t('bar.desk.allergens.help')"
      :ui="{ header: 'pe-14' }"
    >
      <template #body>
        <div class="grid gap-4">
          <div
            role="group"
            :aria-label="t('bar.desk.allergens.avoids')"
            class="flex flex-wrap gap-2"
          >
            <UButton
              v-for="k in ALLERGENS"
              :key="k"
              color="neutral"
              :variant="avoids(k) ? 'solid' : 'outline'"
              :aria-pressed="avoids(k)"
              :label="t(`bar.allergen.${k}`)"
              @click="toggleAvoid(k)"
            />
          </div>
          <ul class="divide-y divide-default">
            <li
              v-for="row in allergenRows"
              :key="row.key"
              class="flex items-start justify-between gap-3 py-2"
            >
              <span class="font-medium">{{ row.name }}</span>
              <UBadge
                :color="row.tone"
                variant="subtle"
                class="max-w-[60%] text-end whitespace-normal"
                :icon="row.tone === 'error' ? 'i-lucide-octagon-alert' : row.tone === 'warning' ? 'i-lucide-triangle-alert' : row.tone === 'success' ? 'i-lucide-check' : 'i-lucide-circle-help'"
                :label="row.text"
              />
            </li>
          </ul>
          <p
            v-if="menu?.allergenStatement"
            class="text-sm text-muted"
          >
            {{ menu.allergenStatement }}
          </p>
        </div>
      </template>
      <template
        v-if="avoid.length"
        #footer
      >
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('bar.desk.allergens.clear')"
          @click="avoid = []"
        />
      </template>
    </UModal>

    <!-- The size window: the second press for a product sold in more than one size. -->
    <UModal
      :open="!!sizing"
      :title="sizing?.name"
      :description="t('bar.desk.pick-size')"
      @update:open="v => { if (!v) sizing = null }"
    >
      <template #body>
        <div class="grid gap-2 sm:grid-cols-2">
          <UButton
            v-for="i in sizing?.items ?? []"
            :key="i.variantId"
            color="neutral"
            variant="outline"
            size="xl"
            block
            class="min-h-14 justify-between"
            @click="pick(i)"
          >
            <span>{{ i.variant }}</span>
            <span class="tabular-nums">{{ money(i.amountMinor) }}</span>
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- The choice window: sizes at the top, then each group with its usual choice already picked. -->
    <UModal
      :open="!!choosing"
      :title="choosing?.tile.name"
      :description="choosing ? choiceHelp(choosing.item) : undefined"
      @update:open="v => { if (!v) choosing = null }"
    >
      <template #body>
        <div
          v-if="choosing"
          class="grid gap-5"
        >
          <div
            v-if="choosing.tile.items.length > 1"
            role="group"
            :aria-label="t('bar.desk.choices.size')"
            class="space-y-2"
          >
            <p class="text-sm font-medium">
              {{ t('bar.desk.choices.size') }} <span class="font-normal text-muted">· {{ t('bar.desk.choices.pick-one') }}</span>
            </p>
            <div class="grid gap-2 sm:grid-cols-2">
              <UButton
                v-for="i in choosing.tile.items"
                :key="i.variantId"
                size="xl"
                block
                color="neutral"
                :variant="choosing.item.variantId === i.variantId ? 'solid' : 'outline'"
                :aria-pressed="choosing.item.variantId === i.variantId"
                class="justify-between"
                @click="resize(i)"
              >
                <span>{{ i.variant }}</span>
                <span class="tabular-nums">{{ money(unitOf(i, [])) }}</span>
              </UButton>
            </div>
          </div>
          <div
            v-for="g in groupsOf(choosing.item)"
            :key="g.id"
            role="group"
            :aria-label="g.name"
            class="space-y-2"
          >
            <p class="text-sm font-medium">
              {{ g.name }} <span class="font-normal text-muted">· {{ g.maxPicks > 1 ? t('bar.desk.choices.up-to', { count: g.maxPicks }) : g.required ? t('bar.desk.choices.pick-one') : t('bar.desk.choices.optional') }}</span>
            </p>
            <UInput
              v-if="choosing.open[g.id]"
              v-model="choosing.search[g.id]"
              icon="i-lucide-search"
              size="lg"
              :placeholder="t('bar.desk.choices.search', { count: g.options.length })"
              :aria-label="t('bar.desk.choices.search', { count: g.options.length })"
            />
            <div class="grid gap-2 sm:grid-cols-2">
              <UButton
                v-for="o in shownOptions(g)"
                :key="o.key"
                size="xl"
                block
                color="neutral"
                :variant="isPicked(g, o) ? 'solid' : 'outline'"
                :aria-pressed="isPicked(g, o)"
                :disabled="!!refused && o.ageRestricted && !isPicked(g, o)"
                class="justify-between"
                @click="toggle(g, o)"
              >
                <span class="flex min-w-0 flex-col items-start gap-1 text-start">
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="min-w-0 break-words">{{ o.label }}</span>
                    <UBadge
                      v-if="o.ageRestricted && menu?.ageCheck.enabled"
                      color="warning"
                      :variant="isPicked(g, o) ? 'solid' : 'subtle'"
                      size="sm"
                      :label="String(menu.ageCheck.challengeAge)"
                      :aria-label="t('bar.desk.age-check')"
                    />
                  </span>
                  <UBadge
                    v-if="warns(o)"
                    :color="warns(o)!.tone"
                    variant="solid"
                    size="sm"
                    :icon="warns(o)!.tone === 'error' ? 'i-lucide-octagon-alert' : 'i-lucide-triangle-alert'"
                    :label="warns(o)!.text"
                    class="whitespace-normal"
                  />
                </span>
                <span
                  v-if="o.deltaMinor"
                  class="shrink-0 text-sm tabular-nums"
                >{{ o.deltaMinor > 0 ? '+' : '−' }}{{ money(Math.abs(o.deltaMinor)) }}</span>
              </UButton>
              <UButton
                v-if="g.options.length > SHORT && !choosing.open[g.id]"
                size="xl"
                block
                color="neutral"
                variant="soft"
                icon="i-lucide-ellipsis"
                :label="t('bar.desk.choices.more', { name: g.name.toLowerCase(), count: g.options.length - shownOptions(g).length })"
                @click="choosing.open[g.id] = true"
              />
            </div>
            <p
              v-if="choosing.open[g.id] && !shownOptions(g).length"
              class="text-sm text-muted"
            >
              {{ t('bar.desk.choices.none-found') }}
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-3">
          <span class="text-sm text-muted">{{ t('bar.desk.choices.separate') }}</span>
          <UButton
            v-if="choosing"
            size="xl"
            icon="i-lucide-plus"
            :disabled="missing"
            :label="t('bar.desk.choices.add', { amount: money(unitOf(choosing.item, choosing.picks)) })"
            @click="addChosen()"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!prompt"
      :title="t('bar.desk.prompt.title', { age: menu?.ageCheck.challengeAge ?? 25 })"
      :description="[prompt?.entry ? t('bar.desk.prompt.for', { name: label(prompt.entry.item) }) : t('bar.desk.prompt.once'), menu?.ageCheck.minimumAge ? t('bar.desk.prompt.minimum', { age: menu.ageCheck.minimumAge }) : ''].filter(Boolean).join(' ')"
      @update:open="v => { if (!v) prompt = null }"
    >
      <template #body>
        <div class="grid gap-3">
          <!-- Neither answer is the default: the seller looks, then presses one. -->
          <UButton
            size="xl"
            block
            color="neutral"
            variant="outline"
            icon="i-lucide-user-round-check"
            class="min-h-14"
            :label="t('bar.desk.prompt.over')"
            @click="answerPrompt('not_needed')"
          />
          <template v-if="idTypes.length">
            <p class="text-sm font-medium">
              {{ t('bar.desk.prompt.which-id') }}
            </p>
            <div class="grid grid-cols-2 gap-2">
              <UButton
                v-for="id in idTypes"
                :key="id"
                size="xl"
                block
                color="neutral"
                variant="outline"
                :label="t(`bar.desk.id-types.${id}`)"
                @click="answerPrompt('id_checked', id)"
              />
            </div>
          </template>
          <UButton
            v-else
            size="xl"
            block
            color="neutral"
            variant="outline"
            icon="i-lucide-id-card"
            class="min-h-14"
            :label="t('bar.desk.prompt.checked')"
            @click="answerPrompt('id_checked')"
          />
          <UButton
            size="xl"
            block
            color="error"
            variant="soft"
            icon="i-lucide-ban"
            :label="t('bar.desk.refuse-sale')"
            @click="refuseFromPrompt()"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!refusing"
      :title="lines.length || refusing?.entry ? t('bar.desk.refuse-sale') : t('bar.desk.record-refusal')"
      :description="t('bar.desk.refusal.why')"
      @update:open="v => { if (!v) refusing = null }"
    >
      <template #body>
        <div
          v-if="refusing"
          class="grid gap-4"
        >
          <RefusalNotice :refusal="refusalProblem" />
          <URadioGroup
            v-if="scoped"
            v-model="refusing.scope"
            variant="card"
            size="md"
            :ui="{ base: 'size-4', indicator: 'after:size-1.5' }"
            :legend="t('bar.desk.refusal.what')"
            :items="[
              { value: 'restricted', label: t('bar.desk.refusal.restricted'), description: t('bar.desk.refusal.restricted-help', { names: restrictedNames }) },
              { value: 'all', label: t('bar.desk.refusal.all'), description: t('bar.desk.refusal.all-help') },
            ]"
          />
          <p
            v-else-if="lines.length"
            class="text-sm"
          >
            <span class="font-medium">{{ t('bar.desk.refusal.all') }}.</span> {{ t('bar.desk.refusal.all-only') }}
          </p>
          <UFormField
            v-if="menu?.ageCheck.description"
            :label="t('bar.desk.refusal.description')"
            :hint="`${refusing.description.length}/120`"
            :help="t('bar.desk.refusal.description-help')"
            name="description"
          >
            <UTextarea
              v-model="refusing.description"
              :maxlength="120"
              :rows="2"
            />
          </UFormField>
          <div
            role="group"
            :aria-label="t('bar.desk.refusal.reason')"
            class="grid gap-2 sm:grid-cols-2"
          >
            <UButton
              v-for="r in reasonItems"
              :key="r.value"
              size="xl"
              block
              color="error"
              variant="soft"
              :loading="saving"
              class="h-auto min-h-12"
              @click="refuse(r.value)"
            >
              <span class="whitespace-normal break-words text-start">{{ r.label }}</span>
            </UButton>
          </div>
          <UButton
            v-if="refusing.from === 'prompt'"
            block
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            :disabled="saving"
            :label="t('bar.desk.prompt.back')"
            @click="backToPrompt()"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
