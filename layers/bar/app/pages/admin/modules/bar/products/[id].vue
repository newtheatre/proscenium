<!-- A product (S11): its name, category and age check, and its sizes with a price on each list. A
     price is never edited: setting one writes a new price from now or a later moment, so a sale already
     rung up keeps what it was charged. A size or product that has been sold is retired, not deleted. -->
<script setup lang="ts">
import { priceInput, productPatch, variantInput, variantPatch } from '../../../../../../server/input'

interface VariantPrice { listId: string, amountMinor: number | null, from: 'list' | 'standard' | null, next: { amountMinor: number | null, from: number } | null }
interface Variant { id: string, name: string, barcode: string | null, mixerMeasure: boolean, active: boolean, prices: VariantPrice[] }
interface Product { id: string, categoryId: string, name: string, ageRestricted: boolean, ageFromCategory: boolean, active: boolean, groupIds: string[], variants: Variant[] }
interface List { id: string, name: string, standard: boolean }

const { t } = useT()
const route = useRoute()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime } = useDates()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const { offer } = useUndo()
const id = computed(() => String(route.params.id))
interface RecipeLine { id: string, stockItemId: string | null, choiceGroupId: string | null, quantity: number }
interface StockItem { id: string, name: string, baseUnit: 'each' | 'ml' | 'g' }
const { data, status, error, refresh } = await useAPI<{ product: Product, categories: { id: string, name: string }[], groups: { id: string, name: string, source: 'options' | 'mixers', unit: StockItem['baseUnit'] | null }[], lists: List[], canPrice: boolean, canAllergens: boolean, canStock: boolean, recipes: Record<string, RecipeLine[]>, stockItems: StockItem[] }>(() => `/api/bar/products/${id.value}`, { key: `bar:product:${id.value}` })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
type FormRef = { setErrors: (errors: FieldError[]) => void }
const editEl = useTemplateRef<FormRef>('editEl')
const sizeEl = useTemplateRef<FormRef>('sizeEl')
const priceEl = useTemplateRef<FormRef>('priceEl')
const labelEl = useTemplateRef<FormRef>('labelEl')
const trail = computed(() => [{ label: t('bar.navigation.products.label'), to: '/admin/modules/bar/products' }])
const categoryItems = computed(() => (data.value?.categories ?? []).map(c => ({ value: c.id, label: c.name })))

// A product sold one way has a single size called Each, which the till never shows: its card says what it holds instead.
function sizeTitle(v: Variant): string {
  const sold = data.value?.product.variants.filter(x => !x.mixerMeasure) ?? []
  if (sold.length === 1 && v.name === 'Each' && v.active) return t(data.value?.canStock ? 'bar.screens.product.one-size' : 'bar.screens.product.one-size-prices')
  return v.active ? v.name : t('bar.screens.products.retired-name', { name: v.name })
}
const groupItems = computed(() => (data.value?.groups ?? []).map(g => ({ value: g.id, label: g.name })))
const isMixer = computed(() => !!data.value?.product.variants.some(v => v.mixerMeasure && v.active))
const groupNames = computed(() => (data.value?.product.groupIds ?? []).map(g => data.value!.groups.find(x => x.id === g)?.name).filter(Boolean).join(', '))

// The product's own fields, the choices it asks at the till, and whether it can be a mixer.
const editing = ref<{ name: string, categoryId: string, age: 'category' | 'yes' | 'no', groupIds: string[], mixer: boolean } | null>(null)
const ageItems = computed(() => [
  { value: 'category', label: t('bar.screens.add-product.age-as-category-plain') },
  { value: 'yes', label: t('bar.screens.product.age-yes') },
  { value: 'no', label: t('bar.screens.product.age-no') },
])
function edit() {
  const p = data.value!.product
  refusal.value = null
  editing.value = { name: p.name, categoryId: p.categoryId, age: p.ageFromCategory ? 'category' : p.ageRestricted ? 'yes' : 'no', groupIds: [...p.groupIds], mixer: isMixer.value }
}
async function patch(body: Record<string, unknown>) {
  await $api(`/api/bar/products/${id.value}` as string, { method: 'PATCH', body })
  await refresh()
}
const productBody = () => {
  const { name, categoryId, age } = editing.value!
  return { name, categoryId, ageRestricted: age === 'category' ? null : age === 'yes' }
}
async function save() {
  const { groupIds, mixer } = editing.value!
  const fields = productBody()
  refusal.value = null
  try {
    if (groupIds.join() !== data.value!.product.groupIds.join()) await $api(`/api/bar/products/${id.value}/choices` as string, { method: 'POST', body: { groupIds } })
    if (mixer !== isMixer.value) await $api(`/api/bar/products/${id.value}/mixer` as string, { method: 'POST', body: { on: mixer } })
    await patch(fields)
    editing.value = null
    toast.add({ title: t('bar.screens.product.saved'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
    editEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
async function setActive(active: boolean) {
  try {
    await patch({ active })
    offer(active ? t('bar.screens.product.restored') : t('bar.screens.product.retired'), () => patch({ active: !active }))
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

// A size: new (with its Standard price), or renamed, given a barcode, or retired.
const size = ref<{ id: string | null, name: string, barcode: string, amountMinor: number | null } | null>(null)
function editSize(v?: Variant) {
  refusal.value = null
  size.value = v ? { id: v.id, name: v.name, barcode: v.barcode ?? '', amountMinor: null } : { id: null, name: '', barcode: '', amountMinor: null }
}
const sizeBody = () => {
  const s = size.value!
  const barcode = s.barcode.trim() || null
  return s.id ? { name: s.name, barcode } : { name: s.name, barcode, amountMinor: data.value?.canPrice ? s.amountMinor : undefined }
}
async function saveSize() {
  const s = size.value!
  refusal.value = null
  try {
    if (s.id) await $api(`/api/bar/variants/${s.id}` as string, { method: 'PATCH', body: sizeBody() })
    else await $api(`/api/bar/products/${id.value}/variants` as string, { method: 'POST', body: sizeBody() })
    size.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    sizeEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
async function setSizeActive(v: Variant, active: boolean) {
  try {
    await $api(`/api/bar/variants/${v.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
    offer(active ? t('bar.screens.product.size-restored', { name: v.name }) : t('bar.screens.product.size-retired', { name: v.name }), async () => {
      await $api(`/api/bar/variants/${v.id}` as string, { method: 'PATCH', body: { active: !active } })
      await refresh()
    })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

// A price on one list, from now or later; an empty amount takes the size off that list.
const pricing = ref<{ variant: Variant, list: List, amountMinor: number | null, later: boolean, effectiveFrom: number | null } | null>(null)
function setPrice(variant: Variant, list: List) {
  refusal.value = null
  pricing.value = { variant, list, amountMinor: priceOf(variant, list)?.amountMinor ?? null, later: false, effectiveFrom: null }
}
const priceBody = () => {
  const p = pricing.value!
  return { variantId: p.variant.id, priceListId: p.list.id, amountMinor: p.amountMinor, effectiveFrom: p.later && p.effectiveFrom ? p.effectiveFrom : undefined }
}
const validatePrice = () => [...bodyErrors(priceInput, priceBody()), ...needs({ effectiveFrom: pricing.value?.later ? pricing.value.effectiveFrom : true })]
async function savePrice() {
  refusal.value = null
  const p = pricing.value!
  // A price set from now that replaced the list's own can be undone by setting the old one again.
  const was = priceOf(p.variant, p.list)
  const undoable = !p.later && was?.from === 'list'
  try {
    await $api('/api/bar/prices', { method: 'POST', body: priceBody() })
    pricing.value = null
    const back = { variantId: p.variant.id, priceListId: p.list.id, amountMinor: was?.amountMinor ?? null }
    offer(t('bar.screens.product.price-saved'), undoable
      ? async () => {
        await $api('/api/bar/prices', { method: 'POST', body: back })
        await refresh()
      }
      : undefined)
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    priceEl.value?.setErrors(fieldErrors(refusal.value))
  }
}

// Allergens, read from the label: two sets of the 14, and where the answer came from.
const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'] as const
type Answer = { contains: string[], mayContain: string[], checked: boolean, checkedAt: number | null }
const allergens = ref<Answer | null>(null)
// Sizes made from stock answer with their recipe's items; the product's own label is for the rest.
const stockSizes = ref<{ variantId: string, name: string, answer: Answer, items: { id: string, name: string, checked: boolean }[] }[]>([])
// Sizes made only from choices have no label of their own: what is picked answers for them.
const choiceOnly = ref<string[]>([])
async function loadAllergens() {
  if (!data.value?.canAllergens) return
  const read = await $api<{ answer: Answer, sizes: typeof stockSizes.value, choiceOnly?: string[] }>(`/api/bar/products/${id.value}/allergens` as string)
  allergens.value = read.answer
  stockSizes.value = read.sizes
  choiceOnly.value = read.choiceOnly ?? []
}
const ownLabelUsed = computed(() => (data.value?.product.variants ?? []).some(v => v.active && !choiceOnly.value.includes(v.id) && !stockSizes.value.some(s => s.variantId === v.id)))
function describeAnswer(a: Answer): string {
  if (!a.checked) return t('bar.screens.product.allergens-unchecked')
  if (!a.contains.length && !a.mayContain.length) return t('bar.screens.product.none-listed')
  return [a.contains.length ? `${t('bar.screens.product.contains')}: ${named(a.contains)}` : null, a.mayContain.length ? `${t('bar.screens.product.may-contain')}: ${named(a.mayContain)}` : null].filter(Boolean).join(' · ')
}
const fromItems = (items: { name: string, checked: boolean }[]) => t('bar.screens.product.allergens-from', { items: items.map(i => i.checked ? i.name : t('bar.screens.product.allergens-item-unchecked', { name: i.name })).join(', ') })
watch(() => data.value?.canAllergens, loadAllergens, { immediate: true })
const allergenItems = computed(() => ALLERGENS.map(k => ({ value: k as string, label: t(`bar.allergen.${k}`) })))
const named = (keys: string[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')
const allergenFacts = computed(() => {
  const a = allergens.value
  if (!a?.checked) return [{ label: t('bar.screens.product.allergens-state'), value: t('bar.screens.product.label-unchecked') }]
  return [
    { label: t('bar.screens.product.contains'), value: a.contains.length ? named(a.contains) : t('bar.screens.product.none-listed') },
    { label: t('bar.screens.product.may-contain'), value: a.mayContain.length ? named(a.mayContain) : t('bar.screens.product.none-listed') },
    { label: t('bar.screens.product.checked'), value: dateTime(a.checkedAt!) },
  ]
})
const label = ref<{ contains: string[], mayContain: string[], source: 'label' | 'supplier' | 'other' } | null>(null)
const sourceItems = computed(() => (['label', 'supplier', 'other'] as const).map(s => ({ value: s, label: t(`bar.screens.product.sources.${s}`) })))
function editAllergens() {
  refusal.value = null
  label.value = { contains: [...allergens.value?.contains ?? []], mayContain: [...allergens.value?.mayContain ?? []], source: 'label' }
}
async function saveAllergens() {
  const l = label.value!
  refusal.value = null
  try {
    await $api(`/api/bar/products/${id.value}/allergens` as string, { method: 'POST', body: { ...l, mayContain: l.mayContain.filter(k => !l.contains.includes(k)) } })
    label.value = null
    toast.add({ title: t('bar.screens.product.allergens-saved'), color: 'success' })
    await loadAllergens()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    labelEl.value?.setErrors(fieldErrors(refusal.value))
  }
}

// A size's recipe: what selling one uses up. A line is a stock item, or one of the product's choices,
// where the option picked supplies the item (a mixer choice counts servings of the mixer's own recipe).
// A recipe reads as people say it: "25 ml of the chosen spirit, 1 serving of the chosen mixer".
type Draft = { what: string, quantity: number | null }
const recipeOf = ref<{ variant: Variant, lines: Draft[] } | null>(null)
const groupOf = (ref: string) => data.value?.groups.find(g => g.id === ref)
// "the chosen spirit": a choice's name in the middle of a sentence, unless it is an acronym.
const lowered = (name: string) => /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name
const whatItems = computed(() => [
  ...(data.value?.stockItems ?? []).map(i => ({ value: `i:${i.id}`, label: i.name })),
  ...(data.value?.groups ?? []).filter(g => data.value!.product.groupIds.includes(g.id)).map(g => ({ value: `g:${g.id}`, label: t('bar.screens.product.recipe-chosen', { name: lowered(g.name) }) })),
])
const whatName = (what: string) => whatItems.value.find(w => w.value === what)?.label ?? ''
function unitOf(what: string): string {
  const [kind, ref] = [what.slice(0, 1), what.slice(2)]
  if (kind === 'i') return t(`bar.screens.stock.units.${data.value?.stockItems.find(i => i.id === ref)?.baseUnit ?? 'each'}`)
  const group = groupOf(ref)
  if (group?.source === 'mixers') return t('bar.screens.product.recipe-servings')
  return group?.unit ? t(`bar.screens.stock.units.${group.unit}`) : t('bar.screens.product.recipe-measure')
}
function lineText(what: string, quantity: number): string {
  if (what.startsWith('g:') && groupOf(what.slice(2))?.source === 'mixers')
    return t('bar.screens.product.recipe-line-servings', { count: quantity, name: whatName(what) })
  return t('bar.screens.product.recipe-line', { amount: `${quantity} ${unitOf(what)}`, name: whatName(what) })
}
const whatOf = (l: RecipeLine) => l.stockItemId ? `i:${l.stockItemId}` : `g:${l.choiceGroupId}`
function recipeText(v: Variant): string {
  const lines = data.value?.recipes[v.id] ?? []
  if (!lines.length) return t('bar.screens.product.recipe-none')
  return lines.map(l => lineText(whatOf(l), l.quantity)).join(', ')
}
function editRecipe(v: Variant) {
  refusal.value = null
  const lines = (data.value?.recipes[v.id] ?? []).map(l => ({ what: whatOf(l), quantity: l.quantity as number | null }))
  recipeOf.value = { variant: v, lines: lines.length ? lines : [{ what: '', quantity: null }] }
}
// Copy another size's recipe in, to change from there: a Double from the Single.
const copyItems = computed(() => (data.value?.product.variants ?? [])
  .filter(v => v.id !== recipeOf.value?.variant.id && (data.value?.recipes[v.id]?.length ?? 0) > 0)
  .map(v => ({ value: v.id, label: v.name })))
function copyFrom(variantId: string) {
  if (!recipeOf.value) return
  recipeOf.value.lines = (data.value?.recipes[variantId] ?? []).map(l => ({ what: whatOf(l), quantity: l.quantity as number | null }))
}
async function saveRecipe() {
  const r = recipeOf.value!
  refusal.value = null
  const lines = r.lines.filter(l => l.what && l.quantity).map(l => l.what.startsWith('i:') ? { stockItemId: l.what.slice(2), quantity: l.quantity! } : { choiceGroupId: l.what.slice(2), quantity: l.quantity! })
  try {
    await $api(`/api/bar/variants/${r.variant.id}/recipe` as string, { method: 'POST', body: { lines } })
    recipeOf.value = null
    toast.add({ title: t('bar.screens.product.recipe-saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const priceOf = (v: Variant, l: List) => v.prices.find(p => p.listId === l.id)
function shown(v: Variant, l: List): string {
  const p = priceOf(v, l)
  if (!p || p.amountMinor === null) return t('bar.screens.product.not-sold')
  if (p.from === 'standard') return t('bar.screens.product.follows-standard', { amount: money(p.amountMinor) })
  return money(p.amountMinor)
}
function planned(v: Variant, l: List): string | null {
  const next = priceOf(v, l)?.next
  if (!next) return null
  return next.amountMinor === null ? t('bar.screens.product.withdrawn-from', { when: dateTime(next.from) }) : t('bar.screens.product.changes-to', { amount: money(next.amountMinor), when: dateTime(next.from) })
}
</script>

<template>
  <PageFrame
    :title="data?.product.name ?? t('bar.navigation.products.label')"
    :trail="trail"
  >
    <template #status>
      <StatusBadge
        v-if="data && !data.product.active"
        tone="neutral"
        :label="t('bar.screens.retired')"
      />
    </template>
    <template #primary>
      <UButton
        v-if="data"
        icon="i-lucide-plus"
        :label="t('bar.screens.product.add-size')"
        :disabled="!data.product.active"
        @click="editSize()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <PageSection :title="t('bar.screens.product.details')">
          <template #actions>
            <RowActions
              :label="t('bar.screens.product.actions', { name: data.product.name })"
              :items="[
                { label: t('bar.screens.product.edit'), icon: 'i-lucide-pencil', onSelect: edit },
                data.product.active
                  ? { label: t('bar.screens.product.retire'), icon: 'i-lucide-archive', onSelect: () => setActive(false) }
                  : { label: t('bar.screens.product.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setActive(true) },
              ]"
            />
          </template>
          <FactStrip
            class="max-sm:grid-cols-1! lg:grid-cols-4!"
            :facts="[
              { label: t('bar.screens.products.category'), value: data.categories.find(c => c.id === data!.product.categoryId)?.name ?? '' },
              { label: t('bar.screens.product.age-check'), value: (data.product.ageRestricted ? t('bar.screens.product.age-yes') : t('bar.screens.product.age-no')) + (data.product.ageFromCategory ? ` ${t('bar.screens.product.from-category')}` : '') },
              { label: t('bar.screens.product.choices'), value: groupNames || t('bar.screens.product.no-choices') },
              { label: t('bar.screens.product.mixer'), value: isMixer ? t('bar.screens.product.mixer-yes') : t('bar.screens.product.mixer-no') },
            ]"
          />
        </PageSection>

        <PageSection
          v-if="data.canAllergens && allergens"
          :title="t('bar.screens.product.allergens')"
          :description="t('bar.screens.product.allergens-help')"
        >
          <template
            v-if="ownLabelUsed"
            #actions
          >
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-clipboard-check"
              :label="t('bar.screens.product.check-label')"
              @click="editAllergens"
            />
          </template>
          <div class="space-y-4">
            <template v-if="ownLabelUsed">
              <p
                v-if="stockSizes.length"
                class="text-sm text-muted"
              >
                {{ t('bar.screens.product.allergens-own') }}
              </p>
              <FactStrip :facts="allergenFacts" />
            </template>
            <template v-if="stockSizes.length">
              <p class="text-sm text-muted">
                {{ t('bar.screens.product.allergens-from-stock') }}
              </p>
              <RecordList :label="t('bar.screens.product.allergens')">
                <RecordListItem
                  v-for="sz in stockSizes"
                  :key="sz.variantId"
                  :name="sz.name"
                  :description="fromItems(sz.items)"
                >
                  <span class="text-sm">{{ describeAnswer(sz.answer) }}</span>
                </RecordListItem>
              </RecordList>
            </template>
          </div>
        </PageSection>

        <PageSection
          v-for="v in data.product.variants.filter(x => x.active || !x.mixerMeasure)"
          :key="v.id"
          :title="sizeTitle(v)"
          :description="v.mixerMeasure ? t('bar.screens.product.mixer-measure-help') : v.barcode ? t('bar.screens.product.barcode-is', { barcode: v.barcode }) : undefined"
        >
          <template
            v-if="!v.mixerMeasure"
            #actions
          >
            <RowActions
              :label="t('bar.screens.product.size-actions', { name: v.name })"
              :items="[
                { label: t('bar.screens.product.edit-size'), icon: 'i-lucide-pencil', onSelect: () => editSize(v) },
                v.active
                  ? { label: t('bar.screens.product.retire-size'), icon: 'i-lucide-archive', onSelect: () => setSizeActive(v, false) }
                  : { label: t('bar.screens.product.restore-size'), icon: 'i-lucide-archive-restore', onSelect: () => setSizeActive(v, true) },
              ]"
            />
          </template>
          <RecordList
            v-if="!v.mixerMeasure || data.canStock"
            flush
            :label="t('bar.screens.product.prices-of', { name: v.name })"
          >
            <RecordListItem
              v-if="data.canStock"
              :name="t('bar.screens.product.recipe')"
              :description="recipeText(v)"
            >
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                :label="t('bar.screens.product.edit-recipe')"
                :aria-label="t('bar.screens.product.edit-recipe-of', { size: v.name })"
                @click="editRecipe(v)"
              />
            </RecordListItem>
            <RecordListItem
              v-for="l in v.mixerMeasure ? [] : data.lists"
              :key="l.id"
              :name="l.name"
              :description="[shown(v, l), planned(v, l)].filter(Boolean).join(' · ')"
            >
              <UButton
                v-if="data.canPrice"
                color="neutral"
                variant="outline"
                size="sm"
                :label="priceOf(v, l)?.from === 'list' ? t('bar.screens.product.change-price') : t('bar.screens.product.set-price')"
                :aria-label="t('bar.screens.product.set-price-on', { size: v.name, list: l.name })"
                @click="setPrice(v, l)"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      :open="!!editing"
      :title="t('bar.screens.product.edit')"
      @update:open="v => { if (!v) editing = null }"
    >
      <template #body>
        <UForm
          v-if="editing"
          id="bar-product-edit"
          ref="editEl"
          :state="editing"
          :validate="() => bodyErrors(productPatch, productBody())"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.products.name')"
            name="name"
            required
          >
            <UInput v-model="editing.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.products.category')"
            name="categoryId"
          >
            <USelectMenu
              v-model="editing.categoryId"
              :items="categoryItems"
              value-key="value"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.age-check')"
            :help="t('bar.screens.products.age-check-help')"
            name="ageRestricted"
          >
            <USelect
              v-model="editing.age"
              :items="ageItems"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.choices')"
            :help="t('bar.screens.product.choices-help')"
            name="groupIds"
          >
            <USelectMenu
              v-model="editing.groupIds"
              :items="groupItems"
              value-key="value"
              multiple
              :placeholder="t('bar.screens.product.no-choices')"
            />
          </UFormField>
          <UCheckbox
            v-model="editing.mixer"
            :label="t('bar.screens.product.mixer-tick')"
            :description="t('bar.screens.product.mixer-help')"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-product-edit"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!size"
      :title="size?.id ? t('bar.screens.product.edit-size') : t('bar.screens.product.add-size')"
      @update:open="v => { if (!v) size = null }"
    >
      <template #body>
        <UForm
          v-if="size"
          id="bar-size"
          ref="sizeEl"
          :state="size"
          :validate="() => bodyErrors(size?.id ? variantPatch : variantInput, sizeBody())"
          class="space-y-4"
          novalidate
          @submit="saveSize"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.product.size-name')"
            :help="t('bar.screens.product.size-name-help')"
            name="name"
            required
          >
            <UInput v-model="size.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.barcode')"
            :help="t('bar.screens.product.barcode-help')"
            name="barcode"
          >
            <UInput v-model="size.barcode" />
          </UFormField>
          <UFormField
            v-if="!size.id && data?.canPrice"
            :label="t('bar.screens.products.standard-price')"
            name="amountMinor"
          >
            <FieldMoney v-model="size.amountMinor" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-size"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!label"
      :title="t('bar.screens.product.check-label')"
      @update:open="v => { if (!v) label = null }"
    >
      <template #body>
        <UForm
          v-if="label"
          id="bar-allergens"
          ref="labelEl"
          novalidate
          :state="label"
          class="space-y-4"
          @submit="saveAllergens"
        >
          <RefusalNotice :refusal="refusal" />
          <p class="text-sm text-muted">
            {{ t('bar.screens.product.check-label-help') }}
          </p>
          <UFormField name="contains">
            <UCheckboxGroup
              v-model="label.contains"
              :legend="t('bar.screens.product.contains')"
              :items="allergenItems"
              class="columns-2"
            />
          </UFormField>
          <UFormField
            :help="t('bar.screens.product.may-contain-help')"
            name="mayContain"
          >
            <UCheckboxGroup
              v-model="label.mayContain"
              :legend="t('bar.screens.product.may-contain')"
              :items="allergenItems.filter(i => !label!.contains.includes(i.value))"
              class="columns-2"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.source')"
            name="source"
          >
            <USelect
              v-model="label.source"
              :items="sourceItems"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-allergens"
          :label="t('bar.screens.product.allergens-record')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!recipeOf"
      :title="recipeOf ? t('bar.screens.product.recipe-title', { size: recipeOf.variant.name }) : ''"
      :description="t('bar.screens.product.recipe-help')"
      :ui="{ content: 'sm:max-w-2xl' }"
      @update:open="v => { if (!v) recipeOf = null }"
    >
      <template #body>
        <UForm
          v-if="recipeOf"
          id="bar-recipe"
          :state="recipeOf"
          class="space-y-4"
          novalidate
          @submit="saveRecipe"
        >
          <RefusalNotice :refusal="refusal" />
          <p
            v-if="!whatItems.length"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.product.recipe-no-items') }}
          </p>
          <UFormField
            v-if="copyItems.length"
            :label="t('bar.screens.product.recipe-copy')"
            :help="t('bar.screens.product.recipe-copy-help')"
            name="copyFrom"
          >
            <USelectMenu
              :model-value="undefined"
              :items="copyItems"
              :placeholder="t('bar.screens.product.recipe-copy-pick')"
              class="w-48"
              value-key="value"
              @update:model-value="v => copyFrom(v as string)"
            />
          </UFormField>
          <div
            v-for="(line, i) in recipeOf.lines"
            :key="i"
            class="flex items-end gap-2"
          >
            <UFormField
              :label="t('bar.screens.product.recipe-what')"
              :name="`lines.${i}.what`"
              class="min-w-0 flex-1"
            >
              <USelectMenu
                v-model="line.what"
                :items="whatItems"
                value-key="value"
                :placeholder="t('bar.screens.product.recipe-pick')"
              />
            </UFormField>
            <UFormField
              :label="t('bar.screens.product.recipe-quantity')"
              :name="`lines.${i}.quantity`"
            >
              <UFieldGroup>
                <FieldNumber
                  v-model="line.quantity"
                  :min="1"
                />
                <UBadge
                  color="neutral"
                  variant="outline"
                  size="lg"
                  :label="line.what ? unitOf(line.what) : ''"
                />
              </UFieldGroup>
            </UFormField>
            <IconButton
              icon="i-lucide-x"
              :label="line.what ? t('bar.screens.product.recipe-remove-named', { name: whatName(line.what) }) : t('bar.screens.product.recipe-remove')"
              @click="recipeOf.lines.splice(i, 1)"
            />
          </div>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :label="t('bar.screens.product.recipe-add')"
            @click="recipeOf.lines.push({ what: '', quantity: null })"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-recipe"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!pricing"
      :title="pricing ? t('bar.screens.product.price-title', { size: pricing.variant.name, list: pricing.list.name }) : ''"
      @update:open="v => { if (!v) pricing = null }"
    >
      <template #body>
        <UForm
          v-if="pricing"
          id="bar-price"
          ref="priceEl"
          :state="pricing"
          :validate="validatePrice"
          class="space-y-4"
          novalidate
          @submit="savePrice"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.product.price')"
            :help="pricing.list.standard ? t('bar.screens.product.price-help-standard') : t('bar.screens.product.price-help')"
            name="amountMinor"
          >
            <FieldMoney v-model="pricing.amountMinor" />
          </UFormField>
          <UCheckbox
            v-model="pricing.later"
            :label="t('bar.screens.product.later')"
          />
          <UFormField
            v-if="pricing.later"
            :label="t('bar.screens.product.from')"
            name="effectiveFrom"
            required
          >
            <FieldDateTime
              v-model="pricing.effectiveFrom"
              :min="Date.now()"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-price"
          :label="t('bar.screens.product.save-price')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
