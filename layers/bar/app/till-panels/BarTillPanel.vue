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
// The choice fields (`groupIds`, `baseMinor`, the menu's `groups` and `percentOff`) are absent from a
// server without choices, and then every product is as it was: sizes only.
interface Item { variantId: string, productId: string, product: string, variant: string, ageRestricted: boolean, amountMinor: number, groupIds?: string[], baseMinor?: number }
interface Option { key: string, label: string, deltaMinor: number, ageRestricted: boolean }
interface Group { id: string, name: string, source: 'options' | 'mixers', required: boolean, maxPicks: number, defaultKey: string | null, options: Option[] }
interface Choice { groupId: string, key: string }
/** One line of the basket: a size, what was picked on it, and how many. */
interface Entry { key: string, item: Item, picks: Choice[], quantity: number, unitMinor: number, restricted: boolean }
interface Category { id: string, name: string, colour: string | null, items: Item[] }
// `idTypes` and `refusalScope` arrive with the server's support for them; without them the prompt
// asks only whether ID was checked, and a refusal says nothing of its scope.
interface Menu { outletId: string, outlet: string, priceListId: string, priceList: string, percentOff?: number | null, categories: Category[], groups?: Group[], ageCheck: { enabled: boolean, challengeAge: number, description: boolean, idTypes?: string[], refusalScope?: boolean } }
/** A product as one tile: its sizes, cheapest first as the server lists them. */
interface Tile { productId: string, name: string, items: Item[], ageRestricted: boolean, fromMinor: number, choices: boolean }
interface Outlet { id: string, name: string, kind: string }

const props = defineProps<{ modelValue: unknown, locked: boolean, summary: { lines: { label: string, amountMinor: number }[], amountMinor: number } | null, large?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [unknown]
  /** The bar's lines for the till's receipt, the age answer to keep on it, and what was last added. */
  'receipt': [{ lines: { key: string, label: string, detail?: string, quantity: number, amountMinor: number, more: () => void, fewer: () => void }[], note: { text: string, icon: string, action: { label: string, run: () => void } } | null, added: { label: string, undo: () => void } | null }]
}>()

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
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
  clear()
})

// The basket: a line a size and its choices, in the order they were first added. Different choices
// on the same size are different lines.
const basket = ref<Map<string, Entry>>(new Map())
const clientKey = ref(crypto.randomUUID())
const groups = computed(() => new Map((menu.value?.groups ?? []).map(g => [g.id, g])))
const groupsOf = (i: Item) => (i.groupIds ?? []).flatMap(id => groups.value.get(id) ?? [])
const picked = (picks: Choice[]) => picks.flatMap(p => groups.value.get(p.groupId)?.options.find(o => o.key === p.key) ?? [])
const keyOf = (i: Item, picks: Choice[]) => [i.variantId, ...picks.map(p => `${p.groupId}:${p.key}`).sort()].join('|')
// The price of one, worked out as the server does: choices are added before a percentage list's
// discount, which is rounded once on the whole.
function unitOf(i: Item, picks: Choice[]) {
  const extra = picked(picks).reduce((sum, o) => sum + o.deltaMinor, 0)
  const percent = menu.value?.percentOff
  if (percent === null || percent === undefined || i.baseMinor === undefined) return i.amountMinor + extra
  return Math.floor(((i.baseMinor + extra) * (100 - percent) + 50) / 100)
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

function undoLast() {
  const entry = last.value ? basket.value.get(last.value) : undefined
  last.value = null
  if (entry) set(entry, entry.quantity - 1)
}
function send() {
  const said = restricted.value && answer.value
  const lastEntry = last.value ? basket.value.get(last.value) : undefined
  emit('receipt', {
    lines: lines.value.map(l => ({
      key: l.key,
      label: l.item.product,
      detail: detailOf(l) || undefined,
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
  const first = lines.value.find(l => l.restricted) ?? null
  refusing.value = { entry: first ?? lines.value[0] ?? null, scope: first ? 'restricted' : 'all', description: '', from: 'panel', pending: null }
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
        variantId: r.entry?.item.variantId ?? null,
        reasonTermId,
        description: describe(r.description),
        ...(carriesOn ? { basketKey: clientKey.value } : {}),
        ...(menu.value.ageCheck.refusalScope && lines.value.length ? { scope: carriesOn ? 'restricted' : 'all' } : {}),
      },
    })
    refusing.value = null
    last.value = null
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
    toast.add({ title: t('bar.desk.refusal-recorded'), description: carriesOn ? t('bar.desk.refusal-carries-on') : undefined, color: 'success' })
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
  basket.value = new Map()
  answer.value = null
  idType.value = null
  last.value = null
  send()
}
// The till empties every panel after a payment or when the sale is cleared: start a new basket,
// with a new key.
watch(() => props.modelValue, (value) => {
  if (value === null && basket.value.size) {
    clientKey.value = crypto.randomUUID()
    clear()
  }
})

// One tile a product. A product sold one way with nothing to choose is added by its tile; one with
// several sizes opens the size window; one with choices opens the choice window, sizes at its top.
const tiles = (c: Category): Tile[] => {
  const byProduct = new Map<string, Tile>()
  for (const i of c.items) {
    const tile = byProduct.get(i.productId) ?? { productId: i.productId, name: i.product, items: [], ageRestricted: false, fromMinor: i.amountMinor, choices: false }
    tile.items.push(i)
    tile.ageRestricted ||= i.ageRestricted || groupsOf(i).some(g => g.options.some(o => o.ageRestricted))
    tile.fromMinor = Math.min(tile.fromMinor, i.amountMinor)
    tile.choices ||= groupsOf(i).length > 0
    byProduct.set(i.productId, tile)
  }
  return [...byProduct.values()]
}
const inSale = (tile: Tile) => lines.value.reduce((n, l) => n + (l.item.productId === tile.productId ? l.quantity : 0), 0)
const sizing = ref<Tile | null>(null)

// The choice window. The usual choice is picked already, so the common order is one more press.
const SHORT = 6 // not-policy: how many options a group shows before "More"
const choosing = ref<{ tile: Tile, item: Item, picks: Choice[], open: Record<string, boolean>, search: Record<string, string> } | null>(null)
const defaults = (i: Item): Choice[] => groupsOf(i).flatMap(g => g.defaultKey && g.options.some(o => o.key === g.defaultKey) ? [{ groupId: g.id, key: g.defaultKey }] : [])
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

// Every category at first, each under its name; a chip narrows the tiles to one.
const category = ref<string>('all')
watch(menu, () => { category.value = 'all' })
const shown = computed(() => (menu.value?.categories ?? []).filter(c => c.items.length && (category.value === 'all' || c.id === category.value)))
const chips = computed(() => (menu.value?.categories ?? []).filter(c => c.items.length))
const edge = (c: Category) => ({ borderInlineStartColor: c.colour ? `var(--ui-${c.colour})` : undefined })
const dot = (c: Category) => ({ backgroundColor: c.colour ? `var(--ui-${c.colour})` : 'var(--ui-border-accented)' })
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
    <div
      v-else
      class="flex flex-wrap items-end justify-between gap-3"
    >
      <UFormField
        v-if="outletItems.length > 1"
        :label="t('bar.desk.outlet')"
      >
        <USelect
          v-model="outletId"
          :items="outletItems"
          :disabled="locked || lines.length > 0"
          class="min-w-40"
        />
      </UFormField>
      <span v-else />
      <UButton
        v-if="menu?.ageCheck.enabled"
        color="neutral"
        variant="ghost"
        icon="i-lucide-ban"
        :label="lines.length ? t('bar.desk.refuse-sale') : t('bar.desk.record-refusal')"
        :disabled="locked"
        @click="refuseFromPanel()"
      />
    </div>

    <template v-if="menu">
      <p
        v-if="!chips.length"
        class="text-sm text-muted"
      >
        {{ t('bar.desk.empty-menu') }}
      </p>
      <div
        v-if="chips.length > 1"
        role="group"
        :aria-label="t('bar.desk.categories')"
        class="flex gap-2 overflow-x-auto pb-1"
      >
        <UButton
          color="neutral"
          :variant="category === 'all' ? 'solid' : 'soft'"
          :aria-pressed="category === 'all'"
          class="shrink-0"
          :size="large ? 'lg' : 'md'"
          :label="t('bar.desk.all')"
          @click="category = 'all'"
        />
        <UButton
          v-for="c in chips"
          :key="c.id"
          color="neutral"
          :variant="category === c.id ? 'solid' : 'soft'"
          :aria-pressed="category === c.id"
          class="shrink-0"
          :size="large ? 'lg' : 'md'"
          @click="category = c.id"
        >
          <span
            class="size-2.5 rounded-full"
            :style="dot(c)"
          />{{ c.name }}
        </UButton>
      </div>

      <section
        v-for="c in shown"
        :key="c.id"
        class="space-y-2"
        :aria-label="c.name"
      >
        <h3
          v-if="category === 'all' && chips.length > 1"
          class="flex items-center gap-1.5 text-sm font-medium text-muted"
        >
          <span
            class="size-2.5 rounded-full"
            :style="dot(c)"
          />{{ c.name }}
        </h3>
        <div
          class="grid gap-2"
          :class="large ? 'grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]'"
        >
          <UChip
            v-for="tile in tiles(c)"
            :key="tile.productId"
            :show="inSale(tile) > 0"
            :text="inSale(tile)"
            size="3xl"
            inset
            :ui="{ root: 'block' }"
          >
            <UButton
              color="neutral"
              variant="outline"
              block
              class="flex-col items-stretch justify-between gap-1 border-s-4 text-start"
              :class="[large ? 'min-h-20' : 'min-h-16', inSale(tile) ? 'bg-elevated' : '']"
              :style="edge(c)"
              :disabled="locked"
              :aria-haspopup="tile.items.length > 1 || tile.choices ? 'dialog' : undefined"
              @click="press(tile)"
            >
              <span class="flex items-start justify-between gap-2 font-medium">
                <span class="min-w-0 break-words">{{ tile.name }}</span>
                <UBadge
                  v-if="tile.ageRestricted && menu.ageCheck.enabled"
                  color="warning"
                  variant="subtle"
                  size="sm"
                  :label="String(menu.ageCheck.challengeAge)"
                  :aria-label="t('bar.desk.age-check')"
                />
              </span>
              <span class="flex items-baseline justify-between gap-2 text-sm font-normal text-muted">
                <span class="tabular-nums">{{ tile.items.length > 1 ? t('bar.desk.from', { amount: money(tile.fromMinor) }) : money(tile.fromMinor) }}</span>
                <span v-if="tile.items.length > 1">{{ t('bar.desk.sizes', { count: tile.items.length }) }}</span>
                <span v-else-if="tile.choices">{{ t('bar.desk.choose') }}</span>
              </span>
            </UButton>
          </UChip>
        </div>
      </section>
    </template>

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
      :description="t('bar.desk.choices.help')"
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
                class="justify-between"
                @click="toggle(g, o)"
              >
                <span class="flex min-w-0 items-center gap-2 text-start">
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
                <span
                  v-if="o.deltaMinor"
                  class="text-sm tabular-nums"
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
      :description="prompt?.entry ? t('bar.desk.prompt.for', { name: label(prompt.entry.item) }) : t('bar.desk.prompt.once')"
      @update:open="v => { if (!v) prompt = null }"
    >
      <template #body>
        <div class="grid gap-3">
          <UButton
            size="xl"
            block
            color="success"
            variant="soft"
            icon="i-lucide-check"
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
            :legend="t('bar.desk.refusal.what')"
            :items="[
              { value: 'restricted', label: t('bar.desk.refusal.restricted'), description: t('bar.desk.refusal.restricted-help', { names: restrictedNames }) },
              { value: 'all', label: t('bar.desk.refusal.all'), description: t('bar.desk.refusal.all-help') },
            ]"
          />
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
              :label="r.label"
              @click="refuse(r.value)"
            />
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
