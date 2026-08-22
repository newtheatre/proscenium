/**
 * Admin: the shared content-warning vocabulary (ADR-0004). Deleting is refused
 * while any show carries an entry; archive instead (ADR-0010).
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

// `{}` rather than `undefined`: an undefined v-model makes the table's first
// internal sync write back to the parent (ADR-0012).
const columnVisibility = ref({})
const rowSelection = ref<Record<string, boolean>>({})
const { pagination, page, resetPage } = useTablePagination(20)
const showArchived = ref(false)
const kindFilter = ref<'ALL' | ContentWarningKind>('ALL')

/**
 * Deliberately not keyed `content-warnings`: the show editor caches the live
 * vocabulary there, and this page asks for archived ones (ADR-0013).
 */
const requestFetch = useRequestFetch()
const { data: rawData, status, error, refresh } = await useAsyncData(
  'admin-content-warnings',
  () => requestFetch<AdminContentWarning[]>('/api/content-warnings', { query: { includeArchived: 'true' } }),
)

/**
 * **Always an array, never null**: a fresh array per render sends UTable into
 * a loop with no fixed point (ADR-0012).
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

watch([search, showArchived, kindFilter], resetPage)

const selectedCount = computed(() => Object.keys(rowSelection.value).length)

/**
 * Hoisted for the same reason as `rows`: an inline options object builds a
 * fresh row-model function every render (ADR-0012).
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
 * Retire an entry or bring it back: deliberately not a delete (ADR-0010).
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
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.category ?? '-'),
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
