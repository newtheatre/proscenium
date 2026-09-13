<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { showCategoryForm } from '#shared/utils/show-categories'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'
import type { AdminShowCategory } from '#shared/utils/show-categories'

definePageMeta({ layout: 'console', title: 'Show categories', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const includeArchived = ref(true)
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)

interface Listing { items: AdminShowCategory[], total: number, pageSize: number, pages: number }

const empty = (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 })

// Searched and paged in SQL, so what the table shows and what the count says are the same
// question asked once (CONTRIBUTING).
const { data, status, error, refresh } = await useAsyncData(
  'show-categories',
  () => request<Listing>('/api/admin/reference-data/show-categories', {
    query: { includeArchived: includeArchived.value, search: search.value.trim() || undefined, page: page.value },
  }),
  { watch: [page], default: empty },
)

watch([search, includeArchived], () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

const editing = ref<AdminShowCategory | null>(null)
const open = ref(false)
const removing = ref<AdminShowCategory | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) failure.value = null
})

async function reload(): Promise<void> {
  await refresh()
  if (page.value > data.value.pages) page.value = data.value.pages
}

interface FormState {
  name: string
  sort: number
}

const state = reactive<FormState>({ name: '', sort: 0 })

function edit(category: AdminShowCategory | null): void {
  editing.value = category
  failure.value = null
  Object.assign(state, { name: category?.name ?? '', sort: category?.sort ?? 0 })
  open.value = true
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  const body = { name: state.name.trim(), sort: state.sort }
  try {
    if (editing.value) {
      await $fetch(`/api/admin/reference-data/show-categories/${editing.value.id}`, { method: 'PUT', body })
    }
    else {
      await $fetch('/api/admin/reference-data/show-categories', { method: 'POST', body })
    }
    toast.add({ title: editing.value ? 'Category changed' : 'Category added', icon: 'i-lucide-check', color: 'success' })
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

async function setArchived(category: AdminShowCategory, archived: boolean): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/reference-data/show-categories/${category.id}/archive`, { method: 'POST', body: { archived } })
    toast.add({
      title: archived ? 'Category retired' : 'Category back in use',
      description: archived ? 'It stops appearing for a new show and still names every show that already carries it.' : undefined,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await reload()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
}

async function remove(): Promise<void> {
  const category = removing.value
  if (!category) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/reference-data/show-categories/${category.id}`, { method: 'DELETE' })
    toast.add({ title: 'Category deleted', icon: 'i-lucide-check', color: 'success' })
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

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The categories could not be read.') : null))

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (!includeArchived.value) {
    active.push({ key: 'archived', label: 'Hiding retired', icon: 'i-lucide-archive', clear: () => {
      includeArchived.value = true
    } })
  }
  return active
})

const columns: TableColumn<AdminShowCategory>[] = [
  {
    id: 'name',
    header: 'Category',
    cell: ({ row }) => h('div', { class: 'flex flex-wrap items-center gap-2' }, [
      h('span', {}, row.original.name),
      row.original.archived
        ? h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Retired')
        : null,
    ]),
  },
  {
    id: 'inUse',
    header: 'In use',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.inUse ? 'A show belongs to it' : 'Nothing yet'),
  },
  {
    id: 'act',
    header: () => h('span', { class: 'sr-only' }, 'Actions'),
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
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
        'data-test': `archive-${row.original.id}`,
        'onClick': () => setArchived(row.original, !row.original.archived),
      }, () => (row.original.archived ? 'Bring back' : 'Retire')),
      row.original.inUse
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
      icon="i-lucide-layout-grid"
      title="A category is retired, never destroyed"
      description="A category a show belongs to can only be retired: it stops being offered for a new show and still names every show that already carries it. A category nothing has ever used can be deleted outright."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A category"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; includeArchived = true"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="includeArchived"
            label="Including retired categories"
            data-test="categories-archived"
          />
        </UFormField>
      </template>

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
      data-test="categories-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ search ? 'No category matches that.' : 'No categories yet. Add one, and a show has something to belong to.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="categories-total"
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
      description="The name is held once."
    >
      <template #body>
        <UForm
          :schema="showCategoryForm"
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
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="category-name"
            />
          </UFormField>

          <UFormField
            label="Order"
            name="sort"
            description="Lower numbers show first."
          >
            <UInputNumber
              v-model="state.sort"
              class="w-full"
              data-test="category-sort"
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
      :open="removing !== null"
      :title="removing ? `Delete ${removing.name}` : ''"
      description="No show belongs to this category, so there is no history to keep."
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
