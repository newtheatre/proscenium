<script setup lang="ts">
import { h } from 'vue'
import { SERVING_KINDS, categoryForm, categoryPriceForm, says, saysMoney } from '#shared/utils/bar'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { BarCategory, CategoryPrice, ServingKind } from '#shared/utils/bar'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Bar categories', middleware: 'console' })

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: BarCategory[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data, status, error, refresh } = await useAsyncData(
  'bar-categories',
  () => request<Listing>('/api/admin/bar/categories', {
    query: { search: search.value.trim() || undefined, page: page.value },
  }),
  { watch: [page], default: empty },
)

watch(search, () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

const editing = ref<BarCategory | null>(null)
const open = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) failure.value = null
})

const state = reactive({ name: '', sort: 0, colour: undefined as string | undefined })

function edit(category: BarCategory | null): void {
  editing.value = category
  failure.value = null
  Object.assign(state, {
    name: category?.name ?? '',
    sort: category?.sort ?? 0,
    colour: category?.colour ?? undefined,
  })
  open.value = true
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = { name: state.name.trim(), sort: state.sort, colour: state.colour?.trim() || null }
  try {
    if (editing.value) await $fetch(`/api/admin/bar/categories/${editing.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/bar/categories', { method: 'POST', body })

    toast.add({
      title: editing.value ? 'Category changed' : 'Category added',
      description: 'The till draws its next screen from this.',
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

const pricing = ref<BarCategory | null>(null)
const history = ref<CategoryPrice[]>([])
const kindOptions = SERVING_KINDS.map(value => ({ label: says(value), value }))
const price = reactive({ servingKind: 'single' as ServingKind, pricePence: 0, effectiveFrom: '' })

// The field takes pounds and the request carries pence, converted here and nowhere else (0004).
const pounds = computed({
  get: () => price.pricePence / 100,
  set: (value: number) => {
    price.pricePence = Math.round((value ?? 0) * 100)
  },
})

async function editPrices(category: BarCategory): Promise<void> {
  pricing.value = category
  failure.value = null
  history.value = []
  try {
    const answered = await request<{ prices: CategoryPrice[], on: string }>(`/api/admin/bar/categories/${category.id}/prices`)
    history.value = answered.prices
    Object.assign(price, { servingKind: 'single', pricePence: 0, effectiveFrom: answered.on })
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

async function savePrice(): Promise<void> {
  const category = pricing.value
  if (!category) return

  saving.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ effectiveNow: boolean }>(`/api/admin/bar/categories/${category.id}/prices`, {
      method: 'POST',
      body: { servingKind: price.servingKind, pricePence: price.pricePence, effectiveFrom: price.effectiveFrom },
    })
    toast.add({
      title: answered.effectiveNow ? 'Default set, and in force now' : 'Default set, and waiting for its date',
      description: 'Nothing was overwritten: this is a new row, and the ones before it stay.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    await editPrices(category)
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const priceColumns: TableColumn<CategoryPrice>[] = [
  {
    id: 'kind',
    header: 'Serving kind',
    cell: ({ row }) => says(row.original.servingKind),
  },
  {
    id: 'from',
    header: 'From',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h('span', {}, row.original.effectiveFrom),
      row.original.effective
        ? h(resolveComponent('UBadge'), { color: 'success', variant: 'subtle', size: 'sm' }, () => 'In force today')
        : null,
    ]),
  },
  { id: 'price', header: 'Price', cell: ({ row }) => saysMoney(row.original.pricePence) },
]

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The categories could not be read.') : null))

const activeFilters = computed<ActiveFilter[]>(() => (search.value
  ? [{ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } }]
  : []))

const columns: TableColumn<BarCategory>[] = [
  {
    id: 'name',
    header: 'Category',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      row.original.colour
        ? h('span', { class: 'size-3 rounded-full border border-default', style: { backgroundColor: row.original.colour } })
        : null,
      h('span', {}, row.original.name),
    ]),
  },
  { id: 'sort', header: 'Order on the till', cell: ({ row }) => String(row.original.sort) },
  { id: 'products', header: 'Products', cell: ({ row }) => plural(row.original.productCount, 'product') },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(resolveComponent('UButton'), {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `prices-${row.original.id}`,
        'onClick': () => editPrices(row.original),
      }, () => 'Default prices'),
      h(resolveComponent('UButton'), {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
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
      color="neutral"
      variant="subtle"
      icon="i-lucide-layout-grid"
      title="The order here is the order on the till"
      description="A category's place is read when the till draws its buttons, so a change is a save and never a deploy. A category with products in it cannot be removed; rename it instead."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A category"
      :filterable="false"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''"
    >
      <template #actions>
        <UButton
          data-test="add-category"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          Add a category
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bar-categories-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search ? 'No category matches that.' : 'No categories yet. Add one and products have somewhere to sit.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="bar-categories-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'category', 'categories') }}
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
      :title="editing ? `Edit ${editing.name}` : 'Add a category'"
      description="A category groups products on the till and decides the order they appear in."
    >
      <template #body>
        <UForm
          :schema="categoryForm"
          :state="state"
          class="space-y-4"
          data-test="category-form"
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
            description="What the till and every report calls it. Wine, Soft drinks, Spirits."
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="category-name"
            />
          </UFormField>

          <UFormField
            label="Order on the till"
            name="sort"
            description="Lower comes first. Categories sharing a number fall back to their names."
          >
            <UInputNumber
              v-model="state.sort"
              :min="0"
              class="w-full"
              data-test="category-sort"
            />
          </UFormField>

          <UFormField
            label="Colour"
            name="colour"
            hint="Optional"
            description="Six hexadecimal characters after a hash, which the till uses to tell the groups apart."
          >
            <UInput
              v-model="state.colour"
              class="w-full"
              placeholder="Six characters after a hash"
              data-test="category-colour"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="category-submit"
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
      :open="pricing !== null"
      :title="pricing ? `Default prices for ${pricing.name}` : ''"
      description="A variant with no price of its own resolves here, by serving kind. An explicit variant price always wins; prices are dated rows and nothing is ever overwritten."
      @update:open="pricing = null; failure = null"
    >
      <template #body>
        <div class="space-y-4">
          <UForm
            :schema="categoryPriceForm"
            :state="price"
            class="space-y-4"
            data-test="category-price-form"
            @submit="savePrice"
          >
            <UAlert
              v-if="failure"
              data-test="category-price-failure"
              color="error"
              variant="subtle"
              :description="failure"
            />

            <UFormField
              label="Serving kind"
              name="servingKind"
              required
              description="Which of a product's sizes this default applies to."
            >
              <USelect
                v-model="price.servingKind"
                :items="kindOptions"
                class="w-full"
                data-test="category-price-kind"
              />
            </UFormField>

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
                data-test="category-price-amount"
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
                data-test="category-price-from"
              />
            </UFormField>

            <div class="flex flex-wrap gap-2">
              <UButton
                type="submit"
                :loading="saving"
                data-test="category-price-submit"
              >
                Set this default
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
            data-test="category-price-history"
          >
            <template #empty>
              <p class="py-6 text-center text-sm text-muted">
                No default set yet. A variant with no price of its own has nothing to fall back on.
              </p>
            </template>
          </UTable>
        </div>
      </template>
    </UModal>
  </div>
</template>
