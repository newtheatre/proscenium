<script setup lang="ts">
import {
  ALLERGEN_STATES,
  MEASURE_PRESETS,
  PRODUCT_AGE_RESTRICTED_DEFAULT,
  STOCK_UNITS,
  measurePreset,
  presetForCategory,
  says,
} from '#shared/utils/bar'
import type {
  AllergenState,
  BarCategory,
  CategoryPrice,
  MeasurePresetId,
  ProductShape,
  ServingKind,
  StockItem,
  StockUnit,
} from '#shared/utils/bar'

definePageMeta({ layout: 'console', title: 'Set up a product', middleware: 'console', docs: '/docs/bar/products' })

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing<T> { items: T[], total: number, pageSize: number, pages: number }

const noCategories = (): Listing<BarCategory> => ({ items: [], total: 0, pageSize: 0, pages: 1 })
const noItems = (): Listing<StockItem> => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data: categories } = await useAsyncData(
  'setup-categories',
  () => request<Listing<BarCategory>>('/api/admin/bar/categories', { query: { pageSize: 100 } }),
  { default: noCategories },
)

const { data: stock } = await useAsyncData(
  'setup-items',
  // The page cap, which no bar's stock register comes near; the ingredient pickers read this list.
  () => request<Listing<StockItem>>('/api/admin/bar/items', { query: { pageSize: MAX_PAGE_SIZE } }),
  { default: noItems },
)

const categoryOptions = computed(() => categories.value.items.map(item => ({ label: item.name, value: item.id })))

// The register is read a page at a time, so a picker over it searches the register itself rather
// than offering only the page already in hand (F-111 criterion 6, K-123).
const itemSearch = ref('')
const settledItemSearch = useDebounced(itemSearch, 250)

const { data: searchedStock } = await useAsyncData(
  () => `setup-items-search-${settledItemSearch.value}`,
  () => settledItemSearch.value.trim().length < 2
    ? Promise.resolve(noItems())
    : request<Listing<StockItem>>('/api/admin/bar/items', {
        query: { search: settledItemSearch.value.trim(), pageSize: MAX_PAGE_SIZE },
      }),
  { watch: [settledItemSearch], default: noItems, getCachedData: () => undefined },
)

// A chosen item has to stay in the list its picker reads, so what was found is added to the
// page already in hand rather than replacing it.
const knownItems = computed(() => {
  const byId = new Map(stock.value.items.map(item => [item.id, item]))
  for (const item of searchedStock.value.items) byId.set(item.id, item)
  return [...byId.values()]
})
const activeItems = computed(() => knownItems.value.filter(item => item.status === 'ACTIVE'))

const itemOptions = computed(() => activeItems.value
  .map(item => ({ label: `${item.name} (${says(item.unit).toLowerCase()})`, value: item.id })))

// A thing sold as itself leaves the shelf whole, so it comes out of something counted in whole
// items: a measured item picked here would pour one millilitre a sale (F-127 criterion 1).
const sellableItemOptions = computed(() => (shape.value === 'SIMPLE'
  ? activeItems.value.filter(item => item.unit === 'ITEM')
  : activeItems.value).map(item => ({ label: `${item.name} (${says(item.unit).toLowerCase()})`, value: item.id })))

const shape = ref<ProductShape>('UNSET')

const product = reactive({
  name: '',
  categoryId: '',
  sort: 0,
  staffedOnly: false,
  ageRestricted: PRODUCT_AGE_RESTRICTED_DEFAULT,
  allergenState: 'UNKNOWN' as AllergenState,
  allergenNote: '',
})

const itemMode = ref<'NEW' | 'EXISTING'>('NEW')
const existingItemId = ref('')
const newItem = reactive({ name: '', unit: 'ITEM' as StockUnit, containerMl: null as number | null })

interface SizeRow {
  servingKind: ServingKind
  label: string
  qty: number
  // Pounds, because that is what the field takes; the request carries pence, converted once in
  // `body()` and nowhere else (0004).
  pricePounds: number | null
  chosen: boolean
}

const preset = ref<MeasurePresetId | null>(null)
const sizes = ref<SizeRow[]>([])
const components = ref<{ itemId: string, qty: number }[]>([{ itemId: '', qty: 25 }])
const choice = reactive({ offered: false, name: '', includedInPrice: false, qty: 1 })
const choiceOptions = ref<{ itemId: string, qty: number }[]>([{ itemId: '', qty: 1 }])
const opening = reactive({ offered: false, qty: 1, unitCostPounds: null as number | null })

const asPounds = (pence: number | null | undefined): number | null =>
  (pence === null || pence === undefined ? null : pence / 100)
const asPence = (pounds: number | null | undefined): number | null =>
  (pounds === null || pounds === undefined ? null : Math.round(pounds * 100))

const defaults = ref<Map<ServingKind, number>>(new Map())

async function readDefaults(categoryId: string): Promise<void> {
  defaults.value = new Map()
  if (!categoryId) return
  try {
    const answered = await request<{ prices: CategoryPrice[] }>(`/api/admin/bar/categories/${categoryId}/prices`)
    defaults.value = new Map(answered.prices
      .filter(price => price.effective)
      .map(price => [price.servingKind, price.pricePence]))
  }
  catch {
    // A category with no defaults is the ordinary case, and a failed read only means nothing
    // pre-fills: the set-up still submits and the product hides if a size resolves no price.
    defaults.value = new Map()
  }
}

// Refilling writes the rows itself, so the deep watch below has to tell that apart from a person
// typing in them: a category corrected before anything is typed refills, afterwards it does not.
const touched = ref(false)
let refilling = false

watch(sizes, () => {
  if (!refilling) touched.value = true
}, { deep: true })

// A simple product sells as one of the packaged kinds, so the preset fills the choices and only
// the first is ticked; a recipe sells as itself and pours its components rather than a measure.
function fillFrom(id: MeasurePresetId | null): void {
  refilling = true
  touched.value = false
  preset.value = id
  if (shape.value === 'RECIPE') {
    sizes.value = [{ servingKind: 'item', label: says('item'), qty: 0, pricePounds: asPounds(defaults.value.get('item')), chosen: true }]
  }
  else {
    const chosen = id ? measurePreset(id) : null
    sizes.value = (chosen?.sizes ?? []).map((size, index) => ({
      servingKind: size.servingKind,
      label: says(size.servingKind),
      qty: size.qty,
      pricePounds: asPounds(defaults.value.get(size.servingKind)),
      chosen: shape.value !== 'SIMPLE' || index === 0,
    }))
    if (chosen && itemMode.value === 'NEW' && newItem.name === '') {
      newItem.unit = shape.value === 'SIMPLE' ? 'ITEM' : chosen.unit
      newItem.containerMl = shape.value === 'SIMPLE' ? null : chosen.containerMl
    }
  }
  void nextTick(() => {
    refilling = false
  })
}

function suggestedFor(id: string): MeasurePresetId | null {
  const category = categories.value.items.find(item => item.id === id)
  return category ? presetForCategory(category.name) : null
}

// The reads race each other when somebody arrows through the list, so a stale answer is dropped
// rather than filling one category's sizes under another's name.
watch(() => product.categoryId, async (id) => {
  await readDefaults(id)
  if (id !== product.categoryId || touched.value) return
  if (shape.value === 'MEASURED') fillFrom(suggestedFor(id) ?? preset.value)
  if (shape.value === 'SIMPLE') fillFrom('PACKAGED')
  if (shape.value === 'RECIPE') fillFrom(null)
})

watch(() => product.allergenState, (state) => {
  if (state === 'UNKNOWN') product.allergenNote = ''
})

function start(chosen: ProductShape): void {
  shape.value = chosen
  failure.value = null
  product.categoryId = product.categoryId || categoryOptions.value[0]?.value || ''
  if (chosen === 'SIMPLE') {
    // Whole items only: the shape is about a thing that leaves the shelf, not a measure of one.
    Object.assign(newItem, { unit: 'ITEM', containerMl: null })
    existingItemId.value = ''
    fillFrom('PACKAGED')
  }
  if (chosen === 'MEASURED') fillFrom(suggestedFor(product.categoryId))
  if (chosen === 'RECIPE') fillFrom(null)
}

const chosenSizes = computed(() => (shape.value === 'MEASURED'
  ? sizes.value.filter(size => size.chosen)
  : sizes.value.filter(size => size.chosen).slice(0, 1)))

// A product sells each serving kind once, so a shape with one serving reads the first ticked row
// and the measured shape is the only one that submits a list (F-112 criterion 1).
const simpleSize = computed(() => chosenSizes.value[0] ?? null)

const unpriced = computed(() => chosenSizes.value
  .filter(size => size.pricePounds === null && !defaults.value.has(size.servingKind))
  .map(size => says(size.servingKind)))

// The kind is what a category default resolves on, so changing it takes the new kind's default
// rather than leaving the old kind's price under a new name (F-121, 0017).
function soldAs(size: SizeRow, kind: ServingKind): void {
  size.servingKind = kind
  size.label = says(kind)
  size.pricePounds = asPounds(defaults.value.get(kind))
}

// What the screen can say before the route would: an empty measure set, an empty recipe and a
// choice with nothing in it are all refusals worth making without a round trip.
const blocked = computed<string | null>(() => {
  if (!product.name.trim()) return 'It needs a name.'
  if (!product.categoryId) return 'It needs a category.'
  if (shape.value === 'MEASURED' && chosenSizes.value.length === 0) {
    return 'Pick the measures it is poured at, and tick at least one size.'
  }
  if (shape.value !== 'RECIPE' && itemMode.value === 'NEW' && !newItem.name.trim()) {
    return 'The stocked item it comes out of needs a name.'
  }
  if (shape.value !== 'RECIPE' && itemMode.value === 'EXISTING' && !existingItemId.value) {
    return 'Say which stocked item it comes out of.'
  }
  if (shape.value === 'RECIPE') {
    if (components.value.filter(component => component.itemId).length === 0) {
      return 'A recipe is made of at least one stocked item.'
    }
    if (choice.offered && !choice.name.trim()) return 'The choice it comes with needs a name.'
    if (choice.offered && choiceOptions.value.filter(option => option.itemId).length === 0) {
      return 'A choice needs at least one option.'
    }
  }
  return null
})

// The kinds a thing sold as itself comes in. A measure belongs to the measured shape, where the
// size states what it pours: offered here it would write a bottle that depletes one millilitre.
const servingKindOptions = (measurePreset('PACKAGED')?.sizes ?? [])
  .map(size => ({ label: says(size.servingKind), value: size.servingKind }))
const unitOptions = STOCK_UNITS.map(value => ({ label: says(value), value }))
const allergenOptions = ALLERGEN_STATES.map(value => ({ label: says(value), value }))
const presetOptions = MEASURE_PRESETS.map(option => ({ label: option.name, value: option.id }))

function itemPayload(): Record<string, unknown> {
  if (itemMode.value === 'EXISTING') return { mode: 'EXISTING', itemId: existingItemId.value }
  return {
    mode: 'NEW',
    item: {
      name: newItem.name.trim(),
      unit: newItem.unit,
      containerMl: newItem.unit === 'ML' ? newItem.containerMl : null,
      ageRestricted: product.ageRestricted,
    },
  }
}

function productPayload(): Record<string, unknown> {
  return {
    name: product.name.trim(),
    categoryId: product.categoryId,
    sort: product.sort,
    staffedOnly: product.staffedOnly,
    ageRestricted: product.ageRestricted,
    allergenState: product.allergenState,
    allergenNote: product.allergenNote.trim() || null,
  }
}

function body(): Record<string, unknown> {
  const openingPayload = opening.offered ? { qty: opening.qty, unitCostPence: asPence(opening.unitCostPounds) } : null

  if (shape.value === 'SIMPLE') {
    const size = simpleSize.value
    return {
      shape: 'SIMPLE',
      product: productPayload(),
      item: itemPayload(),
      serving: size
        ? { servingKind: size.servingKind, label: size.label.trim(), qty: size.qty, pricePence: asPence(size.pricePounds) }
        : undefined,
      opening: openingPayload,
    }
  }

  if (shape.value === 'MEASURED') {
    return {
      shape: 'MEASURED',
      product: productPayload(),
      item: itemPayload(),
      sizes: chosenSizes.value.map(size => ({
        servingKind: size.servingKind,
        label: size.label.trim(),
        qty: size.qty,
        pricePence: asPence(size.pricePounds),
      })),
      opening: openingPayload,
    }
  }

  const size = simpleSize.value
  return {
    shape: 'RECIPE',
    product: productPayload(),
    serving: {
      servingKind: size?.servingKind ?? 'item',
      label: size?.label.trim() || 'Each',
      pricePence: asPence(size?.pricePounds),
    },
    components: components.value.filter(component => component.itemId),
    choice: choice.offered
      ? {
          group: {
            name: choice.name.trim(),
            options: choiceOptions.value.filter(option => option.itemId),
          },
          qty: choice.qty,
          includedInPrice: choice.includedInPrice,
        }
      : null,
  }
}

async function submit(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ id: string, status: string, reason: string | null }>(
      '/api/admin/bar/products/setup',
      { method: 'POST', body: body() },
    )
    toast.add({
      title: `${product.name.trim()} is set up`,
      description: answered.reason ?? 'It is on the till.',
      icon: 'i-lucide-check',
      color: answered.status === 'ACTIVE' ? 'success' : 'warning',
    })
    await navigateTo(`/bar/products/${answered.id}`)
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const SHAPES: { shape: ProductShape, title: string, description: string, icon: string, test: string }[] = [
  {
    shape: 'SIMPLE',
    title: 'Sold as itself',
    description: 'A can, a bottle, a packet. One of them leaves the shelf with every sale.',
    icon: 'i-lucide-package',
    test: 'shape-simple',
  },
  {
    shape: 'MEASURED',
    title: 'Sold by measure',
    description: 'Wine, spirits, draught. One stocked container pours several sizes.',
    icon: 'i-lucide-wine',
    test: 'shape-measured',
  },
  {
    shape: 'RECIPE',
    title: 'Made from several things',
    description: 'A cocktail or a mixed drink. Selling one depletes each ingredient it pours.',
    icon: 'i-lucide-cup-soda',
    test: 'shape-recipe',
  },
]

// The three cards are one radio group: arrows move between them and only the focused card is in
// the tab order, which is what a group of radios does (K-101 criterion 5).
const shapeCards = useTemplateRef<HTMLElement>('shapeCards')
const focused = ref(0)

function moveFocus(step: number): void {
  focused.value = (focused.value + step + SHAPES.length) % SHAPES.length
  nextTick(() => {
    shapeCards.value?.querySelectorAll<HTMLElement>('[role="radio"]')[focused.value]?.focus()
  })
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div
      v-if="shape === 'UNSET'"
      class="space-y-4"
      data-test="shape-cards"
    >
      <p class="text-sm text-muted">
        What shape is it? Everything else follows from the answer, and nothing here is fixed
        afterwards: a product's shape is read from its serving sizes, so it can always be changed
        on the product's own screen.
      </p>

      <div
        ref="shapeCards"
        class="grid gap-4 sm:grid-cols-3"
        role="radiogroup"
        aria-label="What shape it is"
      >
        <UCard
          v-for="(card, index) in SHAPES"
          :key="card.shape"
          class="cursor-pointer"
          :data-test="card.test"
          role="radio"
          :aria-checked="shape === card.shape"
          :aria-label="card.title"
          :aria-describedby="`${card.test}-description`"
          :tabindex="index === focused ? 0 : -1"
          @click="start(card.shape)"
          @keydown.enter.prevent="start(card.shape)"
          @keydown.space.prevent="start(card.shape)"
          @keydown.left.prevent="moveFocus(-1)"
          @keydown.up.prevent="moveFocus(-1)"
          @keydown.right.prevent="moveFocus(1)"
          @keydown.down.prevent="moveFocus(1)"
        >
          <div class="space-y-2">
            <UIcon
              :name="card.icon"
              class="size-6"
            />
            <h2 class="font-medium">
              {{ card.title }}
            </h2>
            <p
              :id="`${card.test}-description`"
              class="text-sm text-muted"
            >
              {{ card.description }}
            </p>
          </div>
        </UCard>
      </div>

      <UButton
        color="neutral"
        variant="ghost"
        to="/bar/products"
      >
        Every product
      </UButton>
    </div>

    <form
      v-else
      class="space-y-6"
      data-test="setup-form"
      @submit.prevent="submit"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-medium">
          {{ SHAPES.find(card => card.shape === shape)?.title }}
        </h2>
        <UButton
          color="neutral"
          variant="ghost"
          data-test="change-shape"
          @click="shape = 'UNSET'"
        >
          A different shape
        </UButton>
      </div>

      <UCard>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
            description="What the till and every report call it."
          >
            <UInput
              v-model="product.name"
              class="w-full"
              data-test="setup-name"
            />
          </UFormField>

          <UFormField
            label="Product category"
            required
          >
            <USelect
              v-model="product.categoryId"
              :items="categoryOptions"
              class="w-full"
              data-test="setup-category"
            />
          </UFormField>

          <UFormField
            label="Allergens"
            description="Confirmed no allergens is an answer; no information recorded is the absence of one."
          >
            <USelect
              v-model="product.allergenState"
              :items="allergenOptions"
              class="w-full"
              data-test="setup-allergen-state"
            />
          </UFormField>

          <UFormField
            v-if="product.allergenState !== 'UNKNOWN'"
            label="Allergen note"
            :required="product.allergenState === 'RECORDED'"
            description="What staff read out at the bar."
          >
            <UTextarea
              v-model="product.allergenNote"
              :rows="2"
              class="w-full"
              data-test="setup-allergen-note"
            />
          </UFormField>

          <USwitch
            v-model="product.ageRestricted"
            label="Age restricted"
            description="A basket holding one of these asks for a Challenge 25 outcome before it can be paid for."
            data-test="setup-age-restricted"
          />
        </div>
      </UCard>

      <UCard v-if="shape !== 'RECIPE'">
        <div class="space-y-4">
          <h3 class="font-medium">
            What it comes out of
          </h3>

          <URadioGroup
            v-model="itemMode"
            :items="[
              { label: 'A new stocked item', value: 'NEW' },
              { label: 'Something already on the stock register', value: 'EXISTING' },
            ]"
            data-test="setup-item-mode"
          />

          <template v-if="itemMode === 'NEW'">
            <UFormField
              label="Stocked item name"
              required
              description="What the stock register calls it. Cider 440ml can, House red 750ml."
            >
              <UInput
                v-model="newItem.name"
                class="w-full"
                data-test="setup-item-name"
              />
            </UFormField>

            <UFormField
              v-if="shape !== 'SIMPLE'"
              label="Counted in"
              description="Millilitres for anything poured by measure, whole items for anything sold as it comes."
            >
              <USelect
                v-model="newItem.unit"
                :items="unitOptions"
                class="w-full"
                data-test="setup-item-unit"
              />
            </UFormField>

            <UFormField
              v-if="newItem.unit === 'ML' && shape !== 'SIMPLE'"
              label="Container size in millilitres"
              description="What one bottle, keg or cask holds. A serving cannot pour more than this."
            >
              <UInputNumber
                v-model="newItem.containerMl"
                :min="1"
                class="w-full"
                data-test="setup-container"
              />
            </UFormField>
          </template>

          <UFormField
            v-else
            label="Stocked item"
            required
          >
            <USelectMenu
              v-model="existingItemId"
              :items="sellableItemOptions"
              value-key="value"
              placeholder="Search the register"
              class="w-full"
              data-test="setup-existing-item"
              @update:search-term="value => itemSearch = value"
            />
          </UFormField>

          <USwitch
            v-model="opening.offered"
            label="Record an opening delivery"
            description="What is on the shelf now, so the stock figure starts true."
            data-test="setup-opening"
          />

          <div
            v-if="opening.offered"
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              label="Quantity"
              description="In the item's own unit."
            >
              <UInputNumber
                v-model="opening.qty"
                :min="1"
                class="w-full"
                data-test="setup-opening-qty"
              />
            </UFormField>
            <UFormField
              label="Unit cost in pounds"
              description="What was paid for one, for gross profit reporting."
            >
              <UInputNumber
                v-model="opening.unitCostPounds"
                :min="0"
                :step="0.01"
                class="w-full"
                data-test="setup-opening-cost"
              />
            </UFormField>
          </div>
        </div>
      </UCard>

      <UCard v-if="shape === 'MEASURED'">
        <div class="space-y-4">
          <h3 class="font-medium">
            How it is poured
          </h3>

          <UFormField
            label="Measures"
            description="The sizes this kind of drink is usually poured at. Untick any the bar does not sell."
          >
            <USelect
              :model-value="preset ?? undefined"
              :items="presetOptions"
              class="w-full"
              data-test="setup-preset"
              @update:model-value="fillFrom($event as MeasurePresetId)"
            />
          </UFormField>

          <div
            v-for="size in sizes"
            :key="size.servingKind"
            class="grid items-end gap-3 sm:grid-cols-4"
            :data-test="`size-${size.servingKind}`"
          >
            <UCheckbox
              v-model="size.chosen"
              :label="says(size.servingKind)"
              :data-test="`size-chosen-${size.servingKind}`"
            />
            <UFormField label="Label">
              <UInput
                v-model="size.label"
                class="w-full"
                :data-test="`size-label-${size.servingKind}`"
              />
            </UFormField>
            <UFormField label="Pours">
              <UInputNumber
                v-model="size.qty"
                :min="1"
                class="w-full"
                :data-test="`size-qty-${size.servingKind}`"
              />
            </UFormField>
            <UFormField
              label="Price in pounds"
              :description="defaults.has(size.servingKind) ? 'The category default is filled in.' : undefined"
            >
              <UInputNumber
                v-model="size.pricePounds"
                :min="0"
                :step="0.01"
                class="w-full"
                :data-test="`size-price-${size.servingKind}`"
              />
            </UFormField>
          </div>
        </div>
      </UCard>

      <UCard v-if="shape === 'SIMPLE' && simpleSize">
        <div class="space-y-4">
          <h3 class="font-medium">
            How it sells
          </h3>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              label="Sold as"
              description="What the till button says it is."
            >
              <USelect
                :model-value="simpleSize.servingKind"
                :items="servingKindOptions"
                class="w-full"
                data-test="setup-serving-kind"
                @update:model-value="soldAs(simpleSize, $event as ServingKind)"
              />
            </UFormField>
            <UFormField label="Label">
              <UInput
                v-model="simpleSize.label"
                class="w-full"
                data-test="setup-serving-label"
              />
            </UFormField>
            <UFormField
              label="Price in pounds"
              :description="defaults.has(simpleSize.servingKind) ? 'The category default is filled in.' : undefined"
            >
              <UInputNumber
                v-model="simpleSize.pricePounds"
                :min="0"
                :step="0.01"
                class="w-full"
                data-test="setup-price"
              />
            </UFormField>
          </div>
        </div>
      </UCard>

      <UCard v-if="shape === 'RECIPE'">
        <div class="space-y-4">
          <h3 class="font-medium">
            What pouring one depletes
          </h3>

          <div
            v-for="(component, index) in components"
            :key="index"
            class="grid items-end gap-3 sm:grid-cols-3"
            :data-test="`component-${index}`"
          >
            <UFormField label="Stocked item">
              <USelectMenu
                v-model="component.itemId"
                :items="itemOptions"
                value-key="value"
                placeholder="Search the register"
                class="w-full"
                :data-test="`component-item-${index}`"
                @update:search-term="value => itemSearch = value"
              />
            </UFormField>
            <UFormField label="Quantity">
              <UInputNumber
                v-model="component.qty"
                :min="1"
                class="w-full"
                :data-test="`component-qty-${index}`"
              />
            </UFormField>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              :data-test="`component-remove-${index}`"
              @click="components.splice(index, 1)"
            >
              Take the ingredient out
            </UButton>
          </div>

          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-plus"
            data-test="add-component"
            @click="components.push({ itemId: '', qty: 25 })"
          >
            Add an ingredient
          </UButton>

          <UFormField
            label="Price in pounds"
            :description="defaults.has('item') ? 'The category default is filled in.' : undefined"
          >
            <UInputNumber
              v-if="simpleSize"
              v-model="simpleSize.pricePounds"
              :min="0"
              :step="0.01"
              class="w-full sm:w-64"
              data-test="setup-recipe-price"
            />
          </UFormField>

          <USwitch
            v-model="choice.offered"
            label="It comes with a choice"
            description="A mixer or a garnish chosen at the till. The chosen one depletes its own stock."
            data-test="setup-choice"
          />

          <div
            v-if="choice.offered"
            class="space-y-4"
          >
            <UFormField
              label="What the choice is called"
              required
            >
              <UInput
                v-model="choice.name"
                class="w-full"
                data-test="choice-name"
              />
            </UFormField>

            <div
              v-for="(option, index) in choiceOptions"
              :key="index"
              class="grid items-end gap-3 sm:grid-cols-3"
              :data-test="`choice-option-${index}`"
            >
              <UFormField label="Stocked item">
                <USelectMenu
                  v-model="option.itemId"
                  :items="itemOptions"
                  value-key="value"
                  placeholder="Search the register"
                  class="w-full"
                  :data-test="`choice-item-${index}`"
                  @update:search-term="value => itemSearch = value"
                />
              </UFormField>
              <UFormField label="Quantity">
                <UInputNumber
                  v-model="option.qty"
                  :min="1"
                  class="w-full"
                  :data-test="`choice-qty-${index}`"
                />
              </UFormField>
            </div>

            <UButton
              color="neutral"
              variant="subtle"
              icon="i-lucide-plus"
              data-test="add-choice-option"
              @click="choiceOptions.push({ itemId: '', qty: 1 })"
            >
              Add an option
            </UButton>

            <USwitch
              v-model="choice.includedInPrice"
              label="The choice is included in the price"
              description="The mixer costs nothing extra and still depletes stock."
              data-test="choice-included"
            />
          </div>
        </div>
      </UCard>

      <UAlert
        v-if="unpriced.length > 0"
        color="warning"
        variant="subtle"
        icon="i-lucide-tag"
        data-test="unpriced"
        :description="`Nothing prices ${unpriced.join(', ')} yet, so it will be set up hidden. Fill the price in, or set a product category default, and put it on the till after.`"
      />

      <p
        v-if="blocked"
        class="text-sm text-muted"
        data-test="blocked"
      >
        {{ blocked }}
      </p>

      <div class="flex flex-wrap gap-2">
        <UButton
          type="submit"
          :loading="saving"
          :disabled="blocked !== null"
          data-test="setup-submit"
        >
          Set the product up
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          to="/bar/products"
        >
          Back
        </UButton>
      </div>
    </form>
  </div>
</template>
