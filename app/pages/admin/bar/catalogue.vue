<!--
Admin: the bar catalogue. A price change is a new dated row, never an edit, so
the form schedules a price rather than overwriting one.
-->
<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Bar catalogue',
})

interface Category { id: string, name: string, sort: number, colour: string | null }
/** An ingredient is one product, or a choice from one category (ADR-0036). */
interface RecipeItem {
  id: string
  componentProductId: string | null
  choiceCategoryId: string | null
  qty: number
}
interface Product {
  id: string
  categoryId: string
  name: string
  unit: ProductUnit
  containerMl: number | null
  stockOnly: boolean
  recipe: RecipeItem[]
  parQty: number | null
  status: 'ACTIVE' | 'HIDDEN' | 'RETIRED'
  sort: number
  ageRestricted: boolean
  pricePence: number | null
}
interface Discount { id: string, name: string, percent: number, status: 'ACTIVE' | 'RETIRED', sort: number }
interface Catalogue { categories: Category[], products: Product[], discounts: Discount[] }
interface PriceRow { id: string, pricePence: number, effectiveFrom: string, setBy: string | null, pending: boolean }

const requestFetch = useRequestFetch()
const toast = useToast()
const { data, refresh } = await useAsyncData('admin-bar-catalogue', () =>
  requestFetch<Catalogue>('/api/admin/bar/catalogue'))

const products = computed(() => data.value?.products ?? [])
const categories = computed(() => data.value?.categories ?? [])
const discounts = computed(() => data.value?.discounts ?? [])
const busy = ref(false)

/** Money is pence in the store and pounds on screen, converted only here. */
function poundsProxy(read: () => number, write: (pence: number) => void) {
  return computed({
    get: () => read() / 100,
    set: (pounds: number | undefined) => write(Math.round((pounds ?? 0) * 100)),
  })
}

const GBP = { style: 'currency' as const, currency: 'GBP' as const }

function fail(error: unknown, title: string) {
  toast.add({
    title,
    description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
    color: 'error',
  })
}

const categoryName = (id: string) => categories.value.find(c => c.id === id)?.name ?? '-'

const productById = (id: string) => products.value.find(p => p.id === id) ?? null

const unitItems = [...PRODUCT_UNITS]
const statusItems = [...PRODUCT_STATUSES]

/** One picker for both kinds of ingredient, so a row is one choice. */
const ingredientItems = computed(() => [
  ...products.value
    .filter(p => !p.recipe.length && p.status !== 'RETIRED')
    .map(p => ({ label: p.containerMl ? `${p.name} (${p.containerMl} ml)` : p.name, value: `p:${p.id}` })),
  ...categories.value.map(c => ({ label: `Any from ${c.name}`, value: `c:${c.id}` })),
])

function ingredientKey(item: { componentProductId: string | null, choiceCategoryId: string | null }) {
  return item.componentProductId ? `p:${item.componentProductId}` : item.choiceCategoryId ? `c:${item.choiceCategoryId}` : ''
}

/** Whichever the row points at, an amount is in millilitres or in items. */
function ingredientUnit(key: string) {
  if (key.startsWith('p:')) return productById(key.slice(2))?.containerMl ? 'ml' : 'items'
  const pool = products.value.filter(p => p.categoryId === key.slice(2) && !p.recipe.length && p.status === 'ACTIVE')
  return pool[0]?.containerMl ? 'ml' : 'items'
}

function ingredientName(item: RecipeItem) {
  if (item.componentProductId) return productById(item.componentProductId)?.name ?? 'a missing product'
  return `any ${categoryName(item.choiceCategoryId!).toLowerCase()}`
}

/** "25 ml gin, 1 any mixers", the whole recipe on one line. */
function recipeLabel(product: Product) {
  return product.recipe
    .map(item => `${item.qty}${ingredientUnit(ingredientKey(item)) === 'ml' ? ' ml' : ''} ${ingredientName(item)}`)
    .join(', ')
}

/** Undefined is what UInputNumber clears to; the API wants an explicit null. */
function nullableProxy(read: () => number | null, write: (value: number | null) => void) {
  return computed({
    get: () => read() ?? undefined,
    set: (value: number | undefined) => write(value == null ? null : value),
  })
}

const productColumns = [
  { accessorKey: 'name', header: 'Product' },
  { accessorKey: 'categoryId', header: 'Category' },
  { accessorKey: 'pricePence', header: 'Price' },
  { accessorKey: 'size', header: 'Size' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' },
]

// Editing a product
const editOpen = ref(false)
const editing = ref<Product | null>(null)
const form = reactive({
  name: '',
  categoryId: '',
  unit: 'each' as ProductUnit,
  containerMl: null as number | null,
  stockOnly: false,
  recipe: [] as RecipeItem[],
  /** Held in containers so it survives a change of container size. */
  parContainers: null as number | null,
  ageRestricted: true,
  sort: 0,
  status: 'ACTIVE' as Product['status'],
})

const formContainerMl = nullableProxy(() => form.containerMl, (v) => {
  form.containerMl = v
})
const formPar = nullableProxy(() => form.parContainers, (v) => {
  form.parContainers = v
})

function openEdit(product: Product) {
  editing.value = product
  Object.assign(form, {
    name: product.name,
    categoryId: product.categoryId,
    unit: product.unit,
    containerMl: product.containerMl,
    stockOnly: product.stockOnly,
    recipe: product.recipe.map(item => ({ ...item })),
    parContainers: product.parQty == null ? null : product.parQty / (product.containerMl ?? 1),
    ageRestricted: product.ageRestricted,
    sort: product.sort,
    status: product.status,
  })
  editOpen.value = true
}

async function saveProduct() {
  busy.value = true
  try {
    await requestFetch(`/api/admin/bar/products/${editing.value!.id}`, {
      method: 'PATCH',
      // Explicit null, not undefined: clearing the pointer must reach the server.
      body: productBody(form),
    })
    editOpen.value = false
    await refresh()
    toast.add({ title: 'Saved', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) { fail(error, 'Not saved') }
  finally { busy.value = false }
}

// Creating
const newProductOpen = ref(false)
const newProduct = reactive({
  name: '',
  categoryId: '',
  unit: 'each' as ProductUnit,
  containerMl: null as number | null,
  stockOnly: false,
  recipe: [] as RecipeItem[],
  parContainers: null as number | null,
  ageRestricted: true,
  sort: 0,
  pricePence: 0,
})

const newContainerMl = nullableProxy(() => newProduct.containerMl, (v) => {
  newProduct.containerMl = v
})
const newPar = nullableProxy(() => newProduct.parContainers, (v) => {
  newProduct.parContainers = v
})

/** Par is typed in containers; the API stores it in the product's own basis. */
function productBody<T extends { parContainers: number | null, containerMl: number | null, recipe: RecipeItem[] }>(source: T) {
  const { parContainers, recipe, ...rest } = source
  return {
    ...rest,
    parQty: parContainers == null ? null : Math.round(parContainers * (source.containerMl ?? 1)),
    recipe: recipe.map(item => ({
      componentProductId: item.componentProductId,
      choiceCategoryId: item.choiceCategoryId,
      qty: item.qty,
    })),
  }
}

/** A blank row starts on the first thing that could plausibly go in a drink. */
function addIngredient(target: { recipe: RecipeItem[] }) {
  const first = ingredientItems.value[0]?.value ?? ''
  target.recipe.push({
    id: `new-${target.recipe.length}`,
    componentProductId: first.startsWith('p:') ? first.slice(2) : null,
    choiceCategoryId: first.startsWith('c:') ? first.slice(2) : null,
    qty: 25,
  })
}

function setIngredient(item: RecipeItem, key: string) {
  item.componentProductId = key.startsWith('p:') ? key.slice(2) : null
  item.choiceCategoryId = key.startsWith('c:') ? key.slice(2) : null
}

function openNewProduct() {
  Object.assign(newProduct, {
    name: '',
    categoryId: categories.value[0]?.id ?? '',
    unit: 'each',
    containerMl: null,
    stockOnly: false,
    recipe: [],
    parContainers: null,
    ageRestricted: true,
    sort: 0,
    pricePence: 0,
  })
  newProductOpen.value = true
}

async function createProduct() {
  busy.value = true
  try {
    await requestFetch('/api/admin/bar/products', {
      method: 'POST',
      body: {
        ...productBody(newProduct),
        // Nothing stock-only is sold, so it carries no price at all.
        pricePence: newProduct.stockOnly ? undefined : newProduct.pricePence,
      },
    })
    newProductOpen.value = false
    await refresh()
    toast.add({ title: 'Added', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) { fail(error, 'Not added') }
  finally { busy.value = false }
}

const newProductPrice = poundsProxy(
  () => newProduct.pricePence,
  (v) => {
    newProduct.pricePence = v
  },
)

const newCategoryName = ref('')
const newDiscount = reactive({ name: '', percent: 10 })

async function createCategory() {
  if (!newCategoryName.value) return
  busy.value = true
  try {
    await requestFetch('/api/admin/bar/categories', { method: 'POST', body: { name: newCategoryName.value } })
    newCategoryName.value = ''
    await refresh()
  }
  catch (error) { fail(error, 'Not added') }
  finally { busy.value = false }
}

async function createDiscount() {
  if (!newDiscount.name) return
  busy.value = true
  try {
    await requestFetch('/api/admin/bar/discounts', { method: 'POST', body: { ...newDiscount } })
    newDiscount.name = ''
    newDiscount.percent = 10
    await refresh()
  }
  catch (error) { fail(error, 'Not added') }
  finally { busy.value = false }
}

// Pricing
const priceOpen = ref(false)
const pricing = ref<Product | null>(null)
const priceHistory = ref<PriceRow[]>([])
const newPrice = reactive({ pricePence: 0, effectiveFrom: '' })

async function openPrice(product: Product) {
  pricing.value = product
  newPrice.pricePence = product.pricePence ?? 0
  newPrice.effectiveFrom = ''
  priceOpen.value = true
  const res = await requestFetch<{ rows: PriceRow[] }>(`/api/admin/bar/products/${product.id}/prices`)
  priceHistory.value = res.rows
}

const priceInForce = computed(() => priceHistory.value.find(row => !row.pending) ?? null)
const newPricePounds = poundsProxy(
  () => newPrice.pricePence,
  (v) => {
    newPrice.pricePence = v
  },
)

async function savePrice() {
  busy.value = true
  try {
    await requestFetch(`/api/admin/bar/products/${pricing.value!.id}/prices`, {
      method: 'POST',
      body: { pricePence: newPrice.pricePence, effectiveFrom: newPrice.effectiveFrom || undefined },
    })
    priceOpen.value = false
    await refresh()
    toast.add({ title: 'Price scheduled', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) { fail(error, 'Not set') }
  finally { busy.value = false }
}

// Discounts
async function saveDiscount(discount: Discount, patch: Partial<Discount>) {
  busy.value = true
  try {
    await requestFetch(`/api/admin/bar/discounts/${discount.id}`, { method: 'PATCH', body: patch })
    await refresh()
  }
  catch (error) { fail(error, 'Not saved') }
  finally { busy.value = false }
}

async function moveCategory(category: Category, by: number) {
  busy.value = true
  try {
    await requestFetch(`/api/admin/bar/categories/${category.id}`, {
      method: 'PATCH',
      body: { sort: Math.max(0, category.sort + by) },
    })
    await refresh()
  }
  catch (error) { fail(error, 'Not moved') }
  finally { busy.value = false }
}
</script>

<template>
  <UContainer class="space-y-6 py-6">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-semibold">
            Products
          </h3>
          <UButton
            icon="i-lucide-plus"
            size="sm"
            :disabled="!categories.length"
            label="Add product"
            @click="openNewProduct"
          />
        </div>
      </template>

      <UAlert
        v-if="!categories.length"
        class="mb-4"
        icon="i-lucide-info"
        color="neutral"
        variant="subtle"
        title="Add a category first"
        description="Every product belongs to a category, so the till can group the tiles."
      />
      <UTable
        :data="products"
        :columns="productColumns"
      >
        <template #name-cell="{ row }">
          <div class="font-medium">
            {{ row.original.name }}
          </div>
          <div class="text-xs text-muted">
            per {{ row.original.unit }}
            <UBadge
              v-if="row.original.ageRestricted"
              size="sm"
              variant="subtle"
              color="warning"
              class="ml-1"
            >
              Age restricted
            </UBadge>
            <UBadge
              v-if="row.original.stockOnly"
              size="sm"
              variant="subtle"
              color="neutral"
              class="ml-1"
            >
              Stock only
            </UBadge>
          </div>
        </template>
        <template #categoryId-cell="{ row }">
          {{ categoryName(row.original.categoryId) }}
        </template>
        <template #pricePence-cell="{ row }">
          <span class="tabular-nums">{{ row.original.pricePence == null ? 'No price' : formatMoney(row.original.pricePence) }}</span>
        </template>
        <template #size-cell="{ row }">
          <span
            v-if="row.original.recipe.length"
            class="text-xs text-muted"
          >{{ recipeLabel(row.original) }}</span>
          <span
            v-else-if="row.original.containerMl"
            class="text-xs text-muted"
          >{{ row.original.containerMl }} ml {{ row.original.unit }}</span>
          <span
            v-else
            class="text-xs text-muted"
          >counted in {{ unitLabel(row.original.unit) }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            size="sm"
            variant="subtle"
            :color="row.original.status === 'ACTIVE' ? 'success' : row.original.status === 'HIDDEN' ? 'neutral' : 'error'"
          >
            {{ row.original.status }}
          </UBadge>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              size="xs"
              variant="ghost"
              label="Price"
              @click="openPrice(row.original)"
            />
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-pencil"
              aria-label="Edit product"
              @click="openEdit(row.original)"
            />
          </div>
        </template>
      </UTable>
      <template #footer>
        <p class="text-xs text-muted">
          Retiring a product hides it from the till and leaves every past sale, price and stock
          movement exactly as it was.
        </p>
      </template>
    </UCard>

    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h3 class="font-semibold">
            Categories
          </h3>
        </template>
        <div class="mb-3 flex gap-2">
          <UInput
            v-model="newCategoryName"
            placeholder="New category"
            class="flex-1"
            @keyup.enter="createCategory"
          />
          <UButton
            icon="i-lucide-plus"
            :loading="busy"
            :disabled="!newCategoryName"
            aria-label="Add category"
            @click="createCategory"
          />
        </div>
        <ul class="space-y-2">
          <li
            v-for="category in categories"
            :key="category.id"
            class="flex items-center justify-between gap-2"
          >
            <span>{{ category.name }}</span>
            <div class="flex gap-1">
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-arrow-up"
                :disabled="busy"
                aria-label="Move up"
                @click="moveCategory(category, -1)"
              />
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-arrow-down"
                :disabled="busy"
                aria-label="Move down"
                @click="moveCategory(category, 1)"
              />
            </div>
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="font-semibold">
            Discounts
          </h3>
        </template>
        <div class="mb-3 flex gap-2">
          <UInput
            v-model="newDiscount.name"
            placeholder="New discount"
            class="flex-1"
          />
          <UInput
            v-model.number="newDiscount.percent"
            type="number"
            min="1"
            max="100"
            class="w-20"
            aria-label="Percent"
          />
          <UButton
            icon="i-lucide-plus"
            :loading="busy"
            :disabled="!newDiscount.name"
            aria-label="Add discount"
            @click="createDiscount"
          />
        </div>
        <ul class="space-y-2">
          <li
            v-for="discount in discounts"
            :key="discount.id"
            class="flex items-center justify-between gap-2"
          >
            <span>
              {{ discount.name }}
              <span class="text-muted">{{ discount.percent }}%</span>
            </span>
            <UButton
              size="xs"
              variant="ghost"
              :disabled="busy"
              :label="discount.status === 'ACTIVE' ? 'Retire' : 'Restore'"
              @click="saveDiscount(discount, { status: discount.status === 'ACTIVE' ? 'RETIRED' : 'ACTIVE' })"
            />
          </li>
          <li
            v-if="!discounts.length"
            class="text-sm text-muted"
          >
            None set up.
          </li>
        </ul>
        <template #footer>
          <p class="text-xs text-muted">
            A transaction keeps the percentage it was rung up at, so changing one here is never
            retrospective.
          </p>
        </template>
      </UCard>
    </div>

    <UModal
      v-model:open="newProductOpen"
      title="Add a product"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="newProduct.name"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              label="Category"
              required
            >
              <USelectMenu
                v-model="newProduct.categoryId"
                :items="categories.map(c => ({ label: c.name, value: c.id }))"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Sold as">
              <USelectMenu
                v-model="newProduct.unit"
                :items="unitItems"
                class="w-full"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="newProduct.stockOnly"
            label="Stock only: held, but never sold"
            description="A spirits bottle poured as measures. It needs no price and never reaches the till."
          />
          <UFormField
            v-if="!newProduct.stockOnly"
            label="Price"
            required
            help="Sets the first price, effective today."
          >
            <UInputNumber
              v-model="newProductPrice"
              :min="0"
              :step="0.1"
              :format-options="GBP"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="!newProduct.stockOnly"
            label="Made from"
            help="Leave it empty when this product holds its own stock. An amount is in millilitres, or in whole items."
          >
            <div class="space-y-2">
              <div
                v-for="(item, i) in newProduct.recipe"
                :key="item.id"
                class="flex items-end gap-2"
              >
                <USelectMenu
                  :model-value="ingredientKey(item)"
                  :items="ingredientItems"
                  value-key="value"
                  class="flex-1"
                  :aria-label="`Ingredient ${i + 1}`"
                  @update:model-value="key => setIngredient(item, key)"
                />
                <UInputNumber
                  v-model="item.qty"
                  :min="1"
                  class="w-28"
                  :aria-label="`Amount of ingredient ${i + 1}`"
                />
                <span class="pb-2 text-xs text-muted w-10">{{ ingredientUnit(ingredientKey(item)) }}</span>
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  aria-label="Remove ingredient"
                  @click="newProduct.recipe.splice(i, 1)"
                />
              </div>
              <UButton
                size="xs"
                variant="subtle"
                icon="i-lucide-plus"
                label="Add an ingredient"
                :disabled="!ingredientItems.length"
                @click="addIngredient(newProduct)"
              />
            </div>
          </UFormField>
          <div
            v-if="newProduct.recipe.length"
            class="flex flex-wrap gap-1"
          >
            <UButton
              v-for="ml in SERVE_ML_PRESETS"
              :key="ml"
              size="xs"
              variant="subtle"
              color="neutral"
              :label="`${ml} ml`"
              :disabled="!newProduct.recipe.length"
              @click="newProduct.recipe[newProduct.recipe.length - 1]!.qty = ml"
            />
          </div>
          <template v-if="!newProduct.recipe.length">
            <UFormField
              label="Container size (ml)"
              help="700 for a 70 cl bottle. Leave it empty to count this in whole items: cans, packets, bottled beer."
            >
              <UInputNumber
                v-model="newContainerMl"
                :min="1"
                class="w-full"
              />
            </UFormField>
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="ml in CONTAINER_ML_PRESETS"
                :key="ml"
                size="xs"
                variant="subtle"
                color="neutral"
                :label="`${ml} ml`"
                @click="newProduct.containerMl = ml"
              />
              <UButton
                size="xs"
                variant="subtle"
                color="neutral"
                label="Whole items"
                @click="newProduct.containerMl = null"
              />
            </div>
            <UFormField
              :label="`Par level (${unitLabel(newProduct.unit)})`"
              help="Flags the product when stock drops below this."
            >
              <UInputNumber
                v-model="newPar"
                :min="0"
                class="w-full"
              />
            </UFormField>
          </template>
          <UCheckbox
            v-model="newProduct.ageRestricted"
            label="Age restricted"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="newProductOpen = false"
          />
          <UButton
            :loading="busy"
            :disabled="!newProduct.name || !newProduct.categoryId"
            label="Add"
            @click="createProduct"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="editOpen"
      :title="`Edit ${editing?.name ?? 'product'}`"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Category">
              <USelectMenu
                v-model="form.categoryId"
                :items="categories.map(c => ({ label: c.name, value: c.id }))"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Sold as">
              <USelectMenu
                v-model="form.unit"
                :items="unitItems"
                class="w-full"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="form.stockOnly"
            label="Stock only: held, but never sold"
            description="It needs no price and never reaches the till."
          />
          <UFormField
            v-if="!form.stockOnly"
            label="Made from"
            help="Leave it empty when this product holds its own stock. An amount is in millilitres, or in whole items."
          >
            <div class="space-y-2">
              <div
                v-for="(item, i) in form.recipe"
                :key="item.id"
                class="flex items-end gap-2"
              >
                <USelectMenu
                  :model-value="ingredientKey(item)"
                  :items="ingredientItems"
                  value-key="value"
                  class="flex-1"
                  :aria-label="`Ingredient ${i + 1}`"
                  @update:model-value="key => setIngredient(item, key)"
                />
                <UInputNumber
                  v-model="item.qty"
                  :min="1"
                  class="w-28"
                  :aria-label="`Amount of ingredient ${i + 1}`"
                />
                <span class="pb-2 text-xs text-muted w-10">{{ ingredientUnit(ingredientKey(item)) }}</span>
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  aria-label="Remove ingredient"
                  @click="form.recipe.splice(i, 1)"
                />
              </div>
              <UButton
                size="xs"
                variant="subtle"
                icon="i-lucide-plus"
                label="Add an ingredient"
                :disabled="!ingredientItems.length"
                @click="addIngredient(form)"
              />
            </div>
          </UFormField>
          <div
            v-if="form.recipe.length"
            class="flex flex-wrap gap-1"
          >
            <UButton
              v-for="ml in SERVE_ML_PRESETS"
              :key="ml"
              size="xs"
              variant="subtle"
              color="neutral"
              :label="`${ml} ml`"
              :disabled="!form.recipe.length"
              @click="form.recipe[form.recipe.length - 1]!.qty = ml"
            />
          </div>
          <template v-if="!form.recipe.length">
            <UFormField
              label="Container size (ml)"
              help="700 for a 70 cl bottle. Leave it empty to count this in whole items: cans, packets, bottled beer."
            >
              <UInputNumber
                v-model="formContainerMl"
                :min="1"
                class="w-full"
              />
            </UFormField>
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="ml in CONTAINER_ML_PRESETS"
                :key="ml"
                size="xs"
                variant="subtle"
                color="neutral"
                :label="`${ml} ml`"
                @click="form.containerMl = ml"
              />
              <UButton
                size="xs"
                variant="subtle"
                color="neutral"
                label="Whole items"
                @click="form.containerMl = null"
              />
            </div>
            <UFormField
              :label="`Par level (${unitLabel(form.unit)})`"
              help="Flags the product when stock drops below this."
            >
              <UInputNumber
                v-model="formPar"
                :min="0"
                class="w-full"
              />
            </UFormField>
          </template>
          <UFormField label="Status">
            <USelectMenu
              v-model="form.status"
              :items="statusItems"
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-model="form.ageRestricted"
            label="Age restricted"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="editOpen = false"
          />
          <UButton
            :loading="busy"
            label="Save"
            @click="saveProduct"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="priceOpen"
      :title="`Price ${pricing?.name ?? ''}`"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            icon="i-lucide-history"
            color="neutral"
            variant="subtle"
            title="A price is added, never edited"
            :description="priceInForce
              ? `In force now: ${formatMoney(priceInForce.pricePence)} from ${priceInForce.effectiveFrom}. Setting a new one leaves that row in place as the history.`
              : 'Nothing is set yet, so this product cannot be sold.'"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              label="New price"
              required
            >
              <UInputNumber
                v-model="newPricePounds"
                :min="0"
                :step="0.1"
                :format-options="GBP"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="From"
              help="Leave empty for today. A future date schedules it."
            >
              <UInput
                v-model="newPrice.effectiveFrom"
                type="date"
                class="w-full"
              />
            </UFormField>
          </div>
          <div v-if="priceHistory.length">
            <p class="mb-1 text-xs uppercase tracking-wide text-muted">
              History
            </p>
            <ul class="space-y-1 text-sm">
              <li
                v-for="row in priceHistory"
                :key="row.id"
                class="flex justify-between"
              >
                <span>
                  {{ row.effectiveFrom }}
                  <UBadge
                    v-if="row.pending"
                    size="sm"
                    variant="subtle"
                    color="info"
                    class="ml-1"
                  >
                    Scheduled
                  </UBadge>
                </span>
                <span class="tabular-nums">
                  {{ formatMoney(row.pricePence) }}
                  <span class="text-muted">{{ row.setBy ? `· ${row.setBy}` : '' }}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="priceOpen = false"
          />
          <UButton
            :loading="busy"
            label="Set price"
            @click="savePrice"
          />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
