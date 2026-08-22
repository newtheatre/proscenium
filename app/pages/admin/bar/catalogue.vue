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
interface Product {
  id: string
  categoryId: string
  name: string
  unit: string
  stockProductId: string | null
  depletesMilli: number
  parMilli: number | null
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

function fail(error: unknown, title: string) {
  toast.add({
    title,
    description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
    color: 'error',
  })
}

const categoryName = (id: string) => categories.value.find(c => c.id === id)?.name ?? '—'

/** Only products that hold stock may be pointed at (docs/13 §3.1). */
const stockTargets = computed(() =>
  products.value.filter(p => !p.stockProductId).map(p => ({ label: p.name, value: p.id })))

const productColumns = [
  { accessorKey: 'name', header: 'Product' },
  { accessorKey: 'categoryId', header: 'Category' },
  { accessorKey: 'pricePence', header: 'Price' },
  { accessorKey: 'depletesMilli', header: 'Depletes' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'actions', header: '' },
]

// Editing a product
const editOpen = ref(false)
const editing = ref<Product | null>(null)
const form = reactive({
  name: '',
  categoryId: '',
  unit: 'each',
  stockProductId: undefined as string | undefined,
  depletesMilli: 1000,
  parMilli: null as number | null,
  ageRestricted: true,
  sort: 0,
  status: 'ACTIVE' as Product['status'],
})

function openEdit(product: Product) {
  editing.value = product
  Object.assign(form, {
    name: product.name,
    categoryId: product.categoryId,
    unit: product.unit,
    stockProductId: product.stockProductId ?? undefined,
    depletesMilli: product.depletesMilli,
    parMilli: product.parMilli,
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
      body: { ...form, stockProductId: form.stockProductId ?? null },
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
  unit: 'each',
  stockProductId: undefined as string | undefined,
  depletesMilli: 1000,
  parMilli: null as number | null,
  ageRestricted: true,
  sort: 0,
  pricePence: 0,
})

function openNewProduct() {
  Object.assign(newProduct, {
    name: '',
    categoryId: categories.value[0]?.id ?? '',
    unit: 'each',
    stockProductId: undefined,
    depletesMilli: 1000,
    parMilli: null,
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
      body: { ...newProduct, stockProductId: newProduct.stockProductId ?? null },
    })
    newProductOpen.value = false
    await refresh()
    toast.add({ title: 'Added', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) { fail(error, 'Not added') }
  finally { busy.value = false }
}

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
          </div>
        </template>
        <template #categoryId-cell="{ row }">
          {{ categoryName(row.original.categoryId) }}
        </template>
        <template #pricePence-cell="{ row }">
          <span class="tabular-nums">{{ row.original.pricePence == null ? 'No price' : formatMoney(row.original.pricePence) }}</span>
        </template>
        <template #depletesMilli-cell="{ row }">
          <span
            v-if="row.original.stockProductId"
            class="text-xs text-muted"
          >
            {{ row.original.depletesMilli }} of another product
          </span>
          <span
            v-else
            class="text-xs text-muted"
          >holds stock</span>
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
                :items="['bottle', 'can', 'measure', 'glass', 'each']"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Price (pence)"
            required
            help="Sets the first price, effective today."
          >
            <UInput
              v-model.number="newProduct.pricePence"
              type="number"
              min="0"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Draws stock from"
            help="Leave empty when this product holds its own stock."
          >
            <USelectMenu
              v-model="newProduct.stockProductId"
              :items="stockTargets"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="newProduct.stockProductId"
            label="Thousandths taken per sale"
            help="A 175 ml glass of a 750 ml bottle is 233."
          >
            <UInput
              v-model.number="newProduct.depletesMilli"
              type="number"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Par level (thousandths)"
            help="Flags the product when stock drops below this."
          >
            <UInput
              v-model.number="newProduct.parMilli"
              type="number"
              class="w-full"
            />
          </UFormField>
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
                :items="['bottle', 'can', 'measure', 'glass', 'each']"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Draws stock from"
            help="Leave empty when this product holds its own stock."
          >
            <USelectMenu
              v-model="form.stockProductId"
              :items="stockTargets"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="form.stockProductId"
            label="Thousandths taken per sale"
            help="A 175 ml glass of a 750 ml bottle is 233."
          >
            <UInput
              v-model.number="form.depletesMilli"
              type="number"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Par level (thousandths)">
              <UInput
                v-model.number="form.parMilli"
                type="number"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Status">
              <USelectMenu
                v-model="form.status"
                :items="['ACTIVE', 'HIDDEN', 'RETIRED']"
                class="w-full"
              />
            </UFormField>
          </div>
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
              label="New price (pence)"
              required
            >
              <UInput
                v-model.number="newPrice.pricePence"
                type="number"
                min="0"
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
