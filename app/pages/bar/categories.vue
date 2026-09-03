<script setup lang="ts">
import { h } from 'vue'
import { categoryForm } from '#shared/utils/bar'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { BarCategory } from '#shared/utils/bar'
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
    cell: ({ row }) => h(resolveComponent('UButton'), {
      'size': 'sm',
      'color': 'neutral',
      'variant': 'ghost',
      'data-test': `edit-${row.original.id}`,
      'onClick': () => edit(row.original),
    }, () => 'Edit'),
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
  </div>
</template>
