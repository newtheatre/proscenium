<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { ALLERGEN_STATES, productForm, says } from '#shared/utils/bar'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { AllergenState, BarCategory, BarProduct, ProductStatus } from '#shared/utils/bar'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Bar products', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const includeRetired = ref(true)
const categoryId = ref<string | undefined>(undefined)
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing<T> { items: T[], total: number, pageSize: number, pages: number }

const noProducts = (): Listing<BarProduct> => ({ items: [], total: 0, pageSize: 0, pages: 1 })
const noCategories = (): Listing<BarCategory> => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data, status, error, refresh } = await useAsyncData(
  'bar-products',
  () => request<Listing<BarProduct>>('/api/admin/bar/products', {
    query: {
      includeRetired: includeRetired.value,
      categoryId: categoryId.value,
      search: search.value.trim() || undefined,
      page: page.value,
    },
  }),
  { watch: [page], default: noProducts },
)

// The form needs every category, not the page of them the categories screen shows.
const { data: categories } = await useAsyncData(
  'bar-products-categories',
  () => request<Listing<BarCategory>>('/api/admin/bar/categories', { query: { pageSize: 100 } }),
  { default: noCategories },
)

watch([search, includeRetired, categoryId], () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

const editing = ref<BarProduct | null>(null)
const open = ref(false)
const removing = ref<BarProduct | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) failure.value = null
})

interface FormState {
  name: string
  categoryId: string
  sort: number
  staffedOnly: boolean
  ageRestricted: boolean
  allergenState: AllergenState
  allergenNote?: string
}

const state = reactive<FormState>({
  name: '',
  categoryId: '',
  sort: 0,
  staffedOnly: false,
  ageRestricted: false,
  allergenState: 'UNKNOWN',
})

const categoryOptions = computed(() => categories.value.items.map(item => ({ label: item.name, value: item.id })))
const allergenOptions = ALLERGEN_STATES.map(value => ({ label: says(value), value }))

async function reload(): Promise<void> {
  await refresh()
  if (page.value > data.value.pages) page.value = data.value.pages
}

function edit(product: BarProduct | null): void {
  editing.value = product
  failure.value = null
  Object.assign(state, {
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? categoryOptions.value[0]?.value ?? '',
    sort: product?.sort ?? 0,
    staffedOnly: product?.staffedOnly ?? false,
    ageRestricted: product?.ageRestricted ?? false,
    allergenState: product?.allergenState ?? 'UNKNOWN',
    allergenNote: product?.allergenNote ?? undefined,
  })
  open.value = true
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = {
    name: state.name.trim(),
    categoryId: state.categoryId,
    sort: state.sort,
    staffedOnly: state.staffedOnly,
    ageRestricted: state.ageRestricted,
    allergenState: state.allergenState,
    allergenNote: state.allergenNote?.trim() || null,
  }
  try {
    if (editing.value) await $fetch(`/api/admin/bar/products/${editing.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/bar/products', { method: 'POST', body })

    toast.add({
      title: editing.value ? 'Product changed' : 'Product added',
      description: editing.value ? undefined : 'It is hidden until you put it on the till.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    open.value = false
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

async function setStatus(product: BarProduct, status: ProductStatus): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/products/${product.id}/status`, { method: 'POST', body: { status } })
    toast.add({ title: `${product.name} is ${says(status).toLowerCase()}`, icon: 'i-lucide-check', color: 'success' })
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

async function remove(): Promise<void> {
  const product = removing.value
  if (!product) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/products/${product.id}`, { method: 'DELETE' })
    toast.add({ title: 'Product deleted', icon: 'i-lucide-check', color: 'success' })
    removing.value = null
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The products could not be read.') : null))

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (categoryId.value) {
    const named = categories.value.items.find(item => item.id === categoryId.value)?.name ?? 'a category'
    active.push({ key: 'category', label: `In ${named}`, icon: 'i-lucide-layout-grid', clear: () => {
      categoryId.value = undefined
    } })
  }
  if (!includeRetired.value) {
    active.push({ key: 'retired', label: 'Hiding retired', icon: 'i-lucide-archive', clear: () => {
      includeRetired.value = true
    } })
  }
  return active
})

const columns: TableColumn<BarProduct>[] = [
  {
    id: 'name',
    header: 'Product',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap items-center gap-2' }, [
        h('span', {}, row.original.name),
        row.original.status === 'ACTIVE'
          ? null
          : h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => says(row.original.status)),
        row.original.ageRestricted
          ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => 'Age restricted')
          : null,
        row.original.staffedOnly
          ? h(UBadge, { color: 'neutral', variant: 'outline', size: 'sm' }, () => 'Staffed only')
          : null,
      ]),
      h('div', { class: 'text-xs text-muted' }, row.original.categoryName),
    ]),
  },
  {
    id: 'allergens',
    header: 'Allergens',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'text-sm' }, says(row.original.allergenState)),
      row.original.allergenNote ? h('div', { class: 'text-xs text-muted' }, row.original.allergenNote) : null,
    ]),
  },
  { id: 'sold', header: 'Sold', cell: ({ row }) => (row.original.everSold ? 'Has been sold' : 'Never sold') },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
      row.original.status === 'ACTIVE'
        ? h(UButton, {
            'size': 'sm',
            'color': 'neutral',
            'variant': 'ghost',
            'data-test': `hide-${row.original.id}`,
            'onClick': () => setStatus(row.original, 'HIDDEN'),
          }, () => 'Hide')
        : h(UButton, {
            'size': 'sm',
            'color': 'neutral',
            'variant': 'ghost',
            'data-test': `activate-${row.original.id}`,
            'onClick': () => setStatus(row.original, 'ACTIVE'),
          }, () => 'Put on the till'),
      row.original.status === 'RETIRED'
        ? null
        : h(UButton, {
            'size': 'sm',
            'color': 'neutral',
            'variant': 'ghost',
            'data-test': `retire-${row.original.id}`,
            'onClick': () => setStatus(row.original, 'RETIRED'),
          }, () => 'Retire'),
      row.original.everSold
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
      v-if="failure && !open && removing === null"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-beer"
      title="A product is retired, never destroyed"
      description="Once anything has been sold as a product it can only be retired: a retired product leaves the till and still resolves for every line, report and export behind it. One nothing has ever been sold as can be deleted outright."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A product"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; includeRetired = true; categoryId = undefined"
    >
      <template #filters>
        <UFormField label="Category">
          <USelect
            v-model="categoryId"
            :items="categoryOptions"
            placeholder="Every category"
            class="w-48"
            data-test="products-category"
          />
        </UFormField>
        <UFormField label="Show">
          <USwitch
            v-model="includeRetired"
            label="Including retired products"
            data-test="products-retired"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          :disabled="categoryOptions.length === 0"
          data-test="add-product"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a product
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bar-products-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search ? 'No product matches that.' : 'No products yet. Add a category first, then what the bar sells.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="bar-products-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'product') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.name}` : 'Add a product'"
      description="A product is what the till shows. Its serving sizes, its recipe and its prices are set up separately."
    >
      <template #body>
        <UForm
          :schema="productForm"
          :state="state"
          class="space-y-4"
          data-test="product-form"
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
            label="Name"
            name="name"
            required
            description="What the till and every report calls it. House red, Lager, Crisps."
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="product-name"
            />
          </UFormField>

          <UFormField
            label="Category"
            name="categoryId"
            required
          >
            <USelect
              v-model="state.categoryId"
              :items="categoryOptions"
              class="w-full"
              data-test="product-category"
            />
          </UFormField>

          <UFormField
            label="Order in the category"
            name="sort"
            description="Lower comes first on the till."
          >
            <UInputNumber
              v-model="state.sort"
              :min="0"
              class="w-full"
              data-test="product-sort"
            />
          </UFormField>

          <UFormField
            label="Allergens"
            name="allergenState"
            description="Confirmed no allergens is an answer; no information recorded is the absence of one, and the till says which."
          >
            <USelect
              v-model="state.allergenState"
              :items="allergenOptions"
              class="w-full"
              data-test="product-allergen-state"
            />
          </UFormField>

          <UFormField
            v-if="state.allergenState !== 'UNKNOWN'"
            label="Allergen note"
            name="allergenNote"
            :required="state.allergenState === 'RECORDED'"
            description="What staff read out at the bar. It has to cover the ingredients, not only the bottle."
          >
            <UTextarea
              v-model="state.allergenNote"
              :rows="2"
              class="w-full"
              data-test="product-allergen-note"
            />
          </UFormField>

          <USwitch
            v-model="state.ageRestricted"
            label="Age restricted"
            description="A basket holding one of these asks for a Challenge 25 outcome before it can be paid for."
            data-test="product-age-restricted"
          />

          <USwitch
            v-model="state.staffedOnly"
            label="Staffed only"
            description="Kept off self-serve tabs, so it is sold across the bar by a person."
            data-test="product-staffed-only"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="product-submit"
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
      :open="removing !== null"
      :title="removing ? `Delete ${removing.name}` : ''"
      description="Nothing has ever been sold as this product, so there is no history to keep."
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
