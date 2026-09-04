<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import {
  SERVING_KINDS,
  componentsForm,
  priceForm,
  says,
  saysMoney,
  saysQuantity,
  variantEditForm,
} from '#shared/utils/bar'
import type {
  BarProduct,
  ProductVariant,
  ServingKind,
  StockItem,
  VariantPrice,
} from '#shared/utils/bar'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Serving sizes', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const route = useRoute()
const request = useRequestFetch()
const toast = useToast()
const productId = computed(() => String(route.params.id))
const failure = ref<string | null>(null)
const saving = ref(false)

interface Sizes { product: BarProduct | null, variants: ProductVariant[] }
interface Listing { items: StockItem[], total: number, pageSize: number, pages: number }

const { data, status, error, refresh } = await useAsyncData(
  () => `bar-variants-${productId.value}`,
  () => request<Sizes>(`/api/admin/bar/products/${productId.value}/variants`),
  { watch: [productId], default: (): Sizes => ({ product: null, variants: [] }) },
)

// The recipe editor needs the stocked items to choose from, up to the page cap.
const { data: stock } = await useAsyncData(
  'bar-variants-stock',
  () => request<Listing>('/api/admin/bar/items', { query: { pageSize: 100, includeRetired: false } }),
  { default: (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 }) },
)

const search = ref('')
const includeRetired = ref(true)

// One product's sizes arrive in full, so the filters are over what is already here rather than a
// second request for a handful of rows.
const shown = computed(() => data.value.variants.filter(variant =>
  (includeRetired.value || variant.status === 'ACTIVE')
  && variant.label.toLowerCase().includes(search.value.trim().toLowerCase())))

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (!includeRetired.value) {
    active.push({ key: 'retired', label: 'Hiding retired', icon: 'i-lucide-archive', clear: () => {
      includeRetired.value = true
    } })
  }
  return active
})

const kindOptions = SERVING_KINDS.map(value => ({ label: says(value), value }))
const itemOptions = computed(() => stock.value.items.map(item => ({ label: item.name, value: item.id })))
const unitOf = (itemId: string): StockItem['unit'] => stock.value.items.find(item => item.id === itemId)?.unit ?? 'ITEM'

const editing = ref<ProductVariant | null>(null)
const open = ref(false)
const state = reactive({ servingKind: 'bottle' as ServingKind, label: '', sort: 0 })

function edit(variant: ProductVariant | null): void {
  editing.value = variant
  failure.value = null
  Object.assign(state, {
    servingKind: variant?.servingKind ?? 'bottle',
    label: variant?.label ?? '',
    sort: variant?.sort ?? 0,
  })
  open.value = true
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = { servingKind: state.servingKind, label: state.label.trim(), sort: state.sort }
  try {
    if (editing.value) await $fetch(`/api/admin/bar/variants/${editing.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/bar/variants', { method: 'POST', body: { ...body, productId: productId.value } })

    toast.add({
      title: editing.value ? 'Serving size changed' : 'Serving size added',
      description: editing.value ? undefined : 'Say what it depletes and what it costs, and the till can draw it.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    open.value = false
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

async function setStatus(variant: ProductVariant, status: 'ACTIVE' | 'RETIRED'): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/variants/${variant.id}/status`, { method: 'POST', body: { status } })
    toast.add({
      title: status === 'RETIRED' ? `${variant.label} is retired` : `${variant.label} is back on the till`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

const removing = ref<ProductVariant | null>(null)

async function remove(): Promise<void> {
  const variant = removing.value
  if (!variant) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/variants/${variant.id}`, { method: 'DELETE' })
    toast.add({ title: 'Serving size deleted', icon: 'i-lucide-check', color: 'success' })
    removing.value = null
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

interface RecipeLine { itemId: string, qty: number }

const pouring = ref<ProductVariant | null>(null)
const recipe = reactive<{ components: RecipeLine[] }>({ components: [] })

function editRecipe(variant: ProductVariant): void {
  pouring.value = variant
  failure.value = null
  recipe.components = variant.components
    .filter(component => component.itemId !== null)
    .map(component => ({ itemId: component.itemId!, qty: component.qty }))
}

const addLine = (): void => {
  recipe.components.push({ itemId: itemOptions.value[0]?.value ?? '', qty: 1 })
}

const dropLine = (index: number): void => {
  recipe.components.splice(index, 1)
}

async function saveRecipe(): Promise<void> {
  const variant = pouring.value
  if (!variant) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/variants/${variant.id}/components`, {
      method: 'PUT',
      body: { components: recipe.components },
    })
    toast.add({
      title: 'What it depletes has changed',
      description: 'Sales from now on deplete this. Movements already written stay as they are.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    pouring.value = null
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const pricing = ref<ProductVariant | null>(null)
const history = ref<VariantPrice[]>([])
const price = reactive({ pricePence: 0, effectiveFrom: '' })

// The field takes pounds and the request carries pence, converted here and nowhere else (0004).
const pounds = computed({
  get: () => price.pricePence / 100,
  set: (value: number) => {
    price.pricePence = Math.round((value ?? 0) * 100)
  },
})

async function editPrices(variant: ProductVariant): Promise<void> {
  pricing.value = variant
  failure.value = null
  history.value = []
  try {
    const answered = await request<{ prices: VariantPrice[], on: string }>(`/api/admin/bar/variants/${variant.id}/prices`)
    history.value = answered.prices
    Object.assign(price, { pricePence: variant.pricePence ?? 0, effectiveFrom: answered.on })
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

async function savePrice(): Promise<void> {
  const variant = pricing.value
  if (!variant) return

  saving.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ effectiveNow: boolean }>(`/api/admin/bar/variants/${variant.id}/prices`, {
      method: 'POST',
      body: { pricePence: price.pricePence, effectiveFrom: price.effectiveFrom },
    })
    toast.add({
      title: answered.effectiveNow ? 'Price set, and in force now' : 'Price set, and waiting for its date',
      description: 'Nothing was overwritten: this is a new row, and the ones before it stay.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    await editPrices(variant)
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The serving sizes could not be read.') : null))

const depletion = (variant: ProductVariant): string =>
  variant.components.length === 0
    ? 'Nothing yet'
    : variant.components
        .map(component => (component.itemId
          ? `${component.itemName}, ${saysQuantity(component.qty, component.unit ?? 'ITEM')}`
          : `${component.choiceGroupName}, ${component.qty}`))
        .join('; ')

const columns: TableColumn<ProductVariant>[] = [
  {
    id: 'label',
    header: 'Serving size',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, row.original.label),
        h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => says(row.original.servingKind)),
        row.original.status === 'RETIRED'
          ? h(UBadge, { color: 'neutral', variant: 'outline', size: 'sm' }, () => 'Retired')
          : null,
      ]),
      h('div', { class: 'text-xs text-muted' }, depletion(row.original)),
    ]),
  },
  {
    id: 'price',
    header: 'Price today',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => (row.original.pricePence === null ? 'Not priced' : saysMoney(row.original.pricePence)),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `recipe-${row.original.id}`,
        'onClick': () => editRecipe(row.original),
      }, () => 'What it depletes'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `prices-${row.original.id}`,
        'onClick': () => editPrices(row.original),
      }, () => 'Prices'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `status-${row.original.id}`,
        'onClick': () => setStatus(row.original, row.original.status === 'RETIRED' ? 'ACTIVE' : 'RETIRED'),
      }, () => (row.original.status === 'RETIRED' ? 'Put back' : 'Retire')),
      row.original.everSold || row.original.everPriced
        ? null
        : h(UButton, {
            'size': 'sm',
            'color': 'error',
            'variant': 'ghost',
            'data-test': `delete-${row.original.id}`,
            'onClick': () => {
              failure.value = null
              removing.value = row.original
            },
          }, () => 'Delete'),
    ]),
  },
]

const priceColumns: TableColumn<VariantPrice>[] = [
  {
    id: 'from',
    header: 'From',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h('span', {}, row.original.effectiveFrom),
      row.original.effective
        ? h(UBadge, { color: 'success', variant: 'subtle', size: 'sm' }, () => 'In force today')
        : null,
    ]),
  },
  { id: 'price', header: 'Price', cell: ({ row }) => saysMoney(row.original.pricePence) },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure"
    />

    <UAlert
      v-if="failure && !open && pouring === null && pricing === null && removing === null"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2
          data-test="product-name"
          class="text-lg font-semibold"
        >
          {{ data.product?.name ?? 'Product' }}
        </h2>
        <p class="text-sm text-muted">
          {{ data.product?.categoryName }}
        </p>
      </div>
      <UButton
        to="/bar/products"
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
      >
        Every product
      </UButton>
    </div>

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-ruler"
      title="One stocked thing, sold at many sizes"
      description="A size carries what pouring it consumes and its own dated price series. Depletion is stated in the stocked item's own units and is independent of price, so a double may deplete twice a single without costing twice as much. No size is ever stored on the product."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A serving size"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; includeRetired = true"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="includeRetired"
            label="Including retired sizes"
            data-test="variants-retired"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-variant"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a serving size
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bar-variants-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search ? 'No serving size matches that.' : 'No serving sizes yet. Add one and this product can go on the till.' }}
        </p>
      </template>
    </UTable>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.label}` : 'Add a serving size'"
      description="A product sells each serving kind once, because the kind is what a category default price resolves on."
    >
      <template #body>
        <UForm
          :schema="variantEditForm"
          :state="state"
          class="space-y-4"
          data-test="variant-form"
          @submit="save"
        >
          <UAlert
            v-if="failure"
            data-test="form-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <UFormField
            label="Serving kind"
            name="servingKind"
            required
            :description="editing?.everSold ? 'Fixed: this size has been sold, so it keeps the kind it sold under.' : 'What a category default price resolves on.'"
          >
            <USelect
              v-model="state.servingKind"
              :items="kindOptions"
              :disabled="editing?.everSold"
              class="w-full"
              data-test="variant-kind"
            />
          </UFormField>

          <UFormField
            label="Label"
            name="label"
            required
            description="What the till button says. Bottle, Small glass, Double."
          >
            <UInput
              v-model="state.label"
              class="w-full"
              data-test="variant-label"
            />
          </UFormField>

          <UFormField
            label="Order on the till"
            name="sort"
            description="Lower comes first within the product."
          >
            <UInputNumber
              v-model="state.sort"
              :min="0"
              class="w-full"
              data-test="variant-sort"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="variant-submit"
            >
              {{ editing ? 'Save it' : 'Add it' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              Back
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="pouring !== null"
      :title="pouring ? `What ${pouring.label} depletes` : ''"
      description="Stated in each stocked item's own units. Editing this affects future sales only: the movements already written are never restated."
      @update:open="pouring = null; failure = null"
    >
      <template #body>
        <UForm
          :schema="componentsForm"
          :state="recipe"
          class="space-y-4"
          data-test="recipe-form"
          @submit="saveRecipe"
        >
          <UAlert
            v-if="failure"
            data-test="recipe-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <p
            v-if="recipe.components.length === 0"
            class="text-sm text-muted"
          >
            Nothing yet. A size with no ingredients depletes no stock when it sells.
          </p>

          <div
            v-for="(line, index) in recipe.components"
            :key="index"
            class="flex flex-wrap items-end gap-2"
          >
            <UFormField
              label="Stocked item"
              :name="`components.${index}.itemId`"
              class="flex-1"
            >
              <USelect
                v-model="line.itemId"
                :items="itemOptions"
                class="w-full"
                :data-test="`recipe-item-${index}`"
              />
            </UFormField>
            <UFormField
              :label="`Quantity in ${says(unitOf(line.itemId)).toLowerCase()}`"
              :name="`components.${index}.qty`"
              class="w-40"
            >
              <UInputNumber
                v-model="line.qty"
                :min="1"
                class="w-full"
                :data-test="`recipe-qty-${index}`"
              />
            </UFormField>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              :aria-label="`Take this ingredient out`"
              :data-test="`recipe-drop-${index}`"
              @click="dropLine(index)"
            />
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              color="neutral"
              variant="subtle"
              icon="i-lucide-plus"
              :disabled="itemOptions.length === 0"
              data-test="recipe-add"
              @click="addLine"
            >
              Add an ingredient
            </UButton>
            <UButton
              type="submit"
              :loading="saving"
              data-test="recipe-submit"
            >
              Save it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="pouring = null"
            >
              Back
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="pricing !== null"
      :title="pricing ? `What ${pricing.label} costs` : ''"
      description="Prices are dated rows and nothing is ever overwritten. The latest row on or before today wins, so a mistake is corrected with a new row today."
      @update:open="pricing = null; failure = null"
    >
      <template #body>
        <div class="space-y-4">
          <UForm
            :schema="priceForm"
            :state="price"
            class="space-y-4"
            data-test="price-form"
            @submit="savePrice"
          >
            <UAlert
              v-if="failure"
              data-test="price-failure"
              color="error"
              variant="subtle"
              :description="failure"
            />

            <UFormField
              label="Price"
              name="pricePence"
              required
              description="In pounds. It is held in pence and formatted only when it is shown."
            >
              <UInputNumber
                v-model="pounds"
                :min="0"
                :step="0.1"
                :format-options="{ style: 'currency', currency: 'GBP' }"
                class="w-full"
                data-test="price-amount"
              />
            </UFormField>

            <UFormField
              label="In force from"
              name="effectiveFrom"
              required
              description="Today for a correction that applies now, or a future date for one that waits."
            >
              <DateField
                v-model="price.effectiveFrom"
                data-test="price-from"
              />
            </UFormField>

            <div class="flex flex-wrap gap-2">
              <UButton
                type="submit"
                :loading="saving"
                data-test="price-submit"
              >
                Set this price
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                @click="pricing = null"
              >
                Back
              </UButton>
            </div>
          </UForm>

          <UTable
            :data="history"
            :columns="priceColumns"
            data-test="price-history"
          >
            <template #empty>
              <p class="py-6 text-center text-sm text-muted">
                Nothing has priced this size yet, so the till has nothing to charge.
              </p>
            </template>
          </UTable>
        </div>
      </template>
    </UModal>

    <UModal
      :open="removing !== null"
      :title="removing ? `Delete ${removing.label}` : ''"
      description="Nothing has been sold as this size and nothing has priced it, so there is no history to keep."
      @update:open="removing = null; failure = null"
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="delete-failure"
          color="error"
          variant="subtle"
          :description="failure"
        />
        <p
          v-else
          class="text-sm text-muted"
        >
          This cannot be undone, and there is nothing behind it to lose.
        </p>
      </template>

      <template #footer>
        <UButton
          color="error"
          :loading="saving"
          data-test="confirm-delete"
          @click="remove"
        >
          Delete it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="removing = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
