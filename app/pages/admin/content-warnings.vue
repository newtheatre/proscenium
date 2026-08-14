/**
 * Admin: Manage Content Warnings Page
 *
 * The shared vocabulary every show picks from. Before this page existed the
 * list could only be changed by a database migration, which is how the legacy
 * import's 384 titles — six spellings of "alcohol" among them — stayed put.
 *
 * Features:
 * - Table view of the vocabulary (archived entries hidden until asked for)
 * - Search by title, category or slug
 * - Filter to technical effects or themes
 * - See how many shows use each entry
 * - Archive an entry that should not be offered again, or restore one
 * - Create and edit entries
 * - Delete an entry (refused while any show uses it — archive instead)
 *
 * Data Loading:
 * - GET /api/content-warnings?includeArchived=true
 *
 * Data Mutations:
 * - POST /api/content-warnings (create)
 * - PUT /api/content-warnings/:id (update, archive, restore)
 * - DELETE /api/content-warnings/:id (delete)
 *
 * @route /admin/content-warnings
 * @authenticated
 * @admin-only
 */
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { Row } from '@tanstack/table-core'
import type { AdminContentWarning } from '~~/shared/types/contentWarnings'

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')
const UBadge = resolveComponent('UBadge')
const UIcon = resolveComponent('UIcon')

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Content Warnings',
})

const toast = useToast()
const confirm = useConfirm()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = useTemplateRef<any>('table')

// `{}` rather than `undefined`: an undefined v-model means the table's first
// internal sync writes a value back to the parent, which is one more
// parent-render-during-child-setup than this page can afford. See `rows` below.
const columnVisibility = ref({})
const rowSelection = ref<Record<string, boolean>>({})
const pagination = ref({ pageSize: 20, pageIndex: 0 })
const showArchived = ref(false)
const kindFilter = ref<'ALL' | ContentWarningKind>('ALL')

/**
 * Server-rendered, and deliberately *not* keyed `content-warnings`.
 *
 * The show editor caches the live vocabulary under that key and reads it back
 * through `getCachedData`. Sharing it here would have the editor offer archived
 * entries, because this page asks for them.
 *
 * `$fetch: useRequestFetch()` is not optional: every admin endpoint is behind
 * authorize(), and a plain useFetch running on the server does not forward the
 * incoming session cookie. See docs/02-architecture.md §Fetching in the admin area.
 */
const requestFetch = useRequestFetch()
const { data: rawData, status, error, refresh } = await useAsyncData(
  'admin-content-warnings',
  () => requestFetch<AdminContentWarning[]>('/api/content-warnings', { query: { includeArchived: 'true' } }),
)

/**
 * Rows for the table. **Always an array, never null.**
 *
 * Load-bearing, not tidiness: binding a fresh array per render makes UTable
 * rebuild its TanStack row models, which writes back through the v-model props,
 * which re-renders this page. That is a render loop with no fixed point. A
 * computed caches, so the identity only changes when its dependencies do — do
 * not reintroduce `?? []` at the binding.
 */
const rows = computed<AdminContentWarning[]>(() => {
  const all = rawData.value ?? []
  return all.filter(warning =>
    (showArchived.value || !warning.archived)
    && (kindFilter.value === 'ALL' || warning.kind === kindFilter.value),
  )
})

/**
 * Search here rather than through TanStack's `columnFilters`, so the footer can
 * report the match count without re-walking the row model.
 */
const search = ref('')
const filteredRows = computed<AdminContentWarning[]>(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return rows.value
  return rows.value.filter(warning =>
    warning.title.toLowerCase().includes(query)
    || warning.slug.toLowerCase().includes(query)
    || (warning.category ?? '').toLowerCase().includes(query)
    || (warning.description ?? '').toLowerCase().includes(query),
  )
})

// UPagination counts from 1; TanStack indexes from 0.
const page = computed({
  get: () => pagination.value.pageIndex + 1,
  set: (value: number) => { pagination.value.pageIndex = value - 1 },
})

watch([search, showArchived, kindFilter], () => {
  pagination.value.pageIndex = 0
})

const selectedCount = computed(() => Object.keys(rowSelection.value).length)

/**
 * Hoisted for the same reason as `rows`: an inline `:pagination-options="{ … }"`
 * builds a fresh options object and row-model function on every render, which
 * on its own is enough to make the table rebuild in a loop.
 */
const paginationOptions = { getPaginationRowModel: getPaginationRowModel() }

const archivedCount = computed(() => rawData.value?.filter(w => w.archived).length ?? 0)

const kindFilterItems = [
  { label: 'All types', value: 'ALL' as const },
  { label: 'Technical effects', value: 'TECHNICAL' as const },
  { label: 'Themes', value: 'GENERAL' as const },
]

const warningToEdit = ref<AdminContentWarning | null>(null)

async function deleteWarning(warning: AdminContentWarning) {
  const confirmed = await confirm({
    title: `Delete '${warning.title}'?`,
    description: warning.showCount > 0
      ? `${warning.showCount} show(s) use this warning, so the deletion will be refused. Archive it instead to stop offering it on new shows.`
      : 'This permanently removes the warning from the vocabulary and cannot be undone.',
    confirmLabel: 'Delete',
    confirmColor: 'error',
  })
  if (!confirmed) return

  try {
    await $fetch(`/api/content-warnings/${warning.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Content warning deleted',
      description: `${warning.title} has been removed`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to delete content warning'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
}

const isArchiving = ref(false)

/**
 * Retire an entry, or bring it back.
 *
 * Deliberately not a delete. DELETE is refused once any show references the
 * warning, and those references are the whole point — a customer looking at a
 * 2019 production still needs to see what it carried. Archiving is the answer
 * for "stop offering this": it disappears from the show editor's pickers while
 * the shows that already have it keep rendering it.
 */
async function setArchived(warning: AdminContentWarning, archived: boolean) {
  if (isArchiving.value) return
  isArchiving.value = true
  try {
    await $fetch(`/api/content-warnings/${warning.id}`, { method: 'PUT', body: { archived } })
    toast.add({
      title: archived ? `${warning.title} archived` : `${warning.title} restored`,
      description: archived
        ? 'It will no longer be offered when editing a show.'
        : 'It can be added to shows again.',
      icon: 'i-lucide-check-circle',
      color: 'success',
    })
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: archived ? 'Could not archive this warning' : 'Could not restore this warning',
      description: getErrorMessage(error, 'Please try again'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
  finally {
    isArchiving.value = false
  }
}

function getRowItems(row: Row<AdminContentWarning>) {
  const warning = row.original
  return [
    {
      type: 'label' as const,
      label: 'Actions',
    },
    {
      label: 'Copy ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(warning.id)
        toast.add({ title: 'Copied to clipboard', description: 'Content warning ID copied' })
      },
    },
    { type: 'separator' as const },
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect() {
        warningToEdit.value = warning
      },
    },
    {
      label: warning.archived ? 'Restore' : 'Archive',
      icon: warning.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive',
      onSelect() {
        setArchived(warning, !warning.archived)
      },
    },
    { type: 'separator' as const },
    {
      label: 'Delete',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() {
        deleteWarning(warning)
      },
    },
  ]
}

const columns: TableColumn<AdminContentWarning>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        'modelValue': table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Select all',
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
        'ariaLabel': 'Select row',
      }),
  },
  {
    accessorKey: 'title',
    header: 'Warning',
    cell: ({ row }) => {
      const warning = row.original
      return h('div', { class: 'flex items-start gap-2' }, [
        warning.icon
          ? h(UIcon, { name: warning.icon, class: 'size-4 shrink-0 mt-0.5 text-muted' })
          : null,
        h('div', undefined, [
          h('p', { class: 'font-medium text-highlighted' }, warning.title),
          warning.description
            ? h('p', { class: 'text-sm text-muted truncate max-w-xs' }, warning.description)
            : null,
        ]),
      ])
    },
  },
  {
    accessorKey: 'kind',
    header: 'Type',
    cell: ({ row }) => h(UBadge, {
      label: row.original.kind === 'TECHNICAL' ? 'Technical' : 'Theme',
      color: row.original.kind === 'TECHNICAL' ? 'info' : 'neutral',
      variant: 'subtle',
    }),
  },
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.category ?? '—'),
  },
  {
    accessorKey: 'showCount',
    header: 'Used by',
    cell: ({ row }) => {
      const count = row.original.showCount
      return h('span', { class: count ? 'text-sm' : 'text-sm text-muted' },
        count === 0 ? 'No shows' : `${count} show${count === 1 ? '' : 's'}`)
    },
  },
  {
    accessorKey: 'slug',
    header: 'Slug',
    cell: ({ row }) => h('span', { class: 'font-mono text-xs text-muted' }, row.original.slug),
  },
  {
    accessorKey: 'sort',
    header: 'Sort',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, String(row.original.sort)),
  },
  {
    accessorKey: 'archived',
    header: 'Status',
    cell: ({ row }) => h(UBadge, {
      label: row.original.archived ? 'Archived' : 'In use',
      color: row.original.archived ? 'warning' : 'success',
      variant: 'subtle',
    }),
  },
  {
    id: 'actions',
    cell: ({ row }) =>
      h('div', { class: 'text-right' },
        h(UDropdownMenu, {
          content: { align: 'end' },
          items: getRowItems(row),
        }, () => h(UButton, {
          color: 'neutral',
          variant: 'ghost',
          icon: 'i-lucide-ellipsis-vertical',
          class: 'ml-auto',
        })),
      ),
  },
]
</script>

<template>
  <AdminPage>
    <AdminTableToolbar>
      <template #left>
        <p class="text-muted">
          The shared list every show picks from. Technical effects have no level; themes are recorded per show as mentioned, discussed or depicted.
        </p>
      </template>
      <template #right>
        <ContentWarningCreateModal @refresh="refresh" />
      </template>
    </AdminTableToolbar>

    <AdminFetchError
      v-if="error"
      :error="error"
      title="Could not load content warnings"
      :on-retry="refresh"
    />

    <AdminTableToolbar>
      <template #left>
        <UInput
          v-model="search"
          placeholder="Search warnings…"
          icon="i-lucide-search"
          class="flex-1"
        />
      </template>
      <template #right>
        <USelect
          v-model="kindFilter"
          :items="kindFilterItems"
          value-key="value"
          class="w-44"
        />
        <UButton
          v-if="archivedCount > 0"
          :label="showArchived ? 'Hide archived' : `Show archived (${archivedCount})`"
          :icon="showArchived ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          color="neutral"
          variant="outline"
          @click="showArchived = !showArchived"
        />
        <AdminTableColumnToggle
          :table="table"
          :labels="{ showCount: 'Used by', archived: 'Status' }"
        />
      </template>
    </AdminTableToolbar>

    <UTable
      ref="table"
      v-model:column-visibility="columnVisibility"
      v-model:row-selection="rowSelection"
      v-model:pagination="pagination"
      :pagination-options="paginationOptions"
      class="shrink-0"
      :data="filteredRows"
      :columns="columns"
      :loading="status === 'pending'"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-triangle-alert"
          :title="search ? 'No warnings match your search' : 'No content warnings yet'"
          :description="search ? 'Try a different title or category.' : 'Add a warning so shows have something to pick from.'"
        />
      </template>
    </UTable>

    <AdminTablePagination
      v-model:page="page"
      :total="filteredRows.length"
      :limit="pagination.pageSize"
      :selected="selectedCount"
      label="content warning"
      :suffix="search ? 'matching' : undefined"
    />

    <ContentWarningEditModal
      :content-warning="warningToEdit"
      @close="warningToEdit = null"
      @refresh="() => { refresh(); warningToEdit = null }"
    />
  </AdminPage>
</template>
