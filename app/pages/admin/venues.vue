/**
 * Admin: venues, their images, and the shared venue-feature vocabulary.
 */
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { Row } from '@tanstack/table-core'

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')
const UBadge = resolveComponent('UBadge')

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  // The layout renders this as the page's only <h1>, so it must match the sidebar
  // nav entry.
  title: 'Venues',
})

const toast = useToast()
const confirm = useConfirm()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = useTemplateRef<any>('table')

// Venue types
interface VenueFeature {
  id: string
  name: string
  description?: string
  icon?: string
}

interface Venue {
  id: string
  name: string
  address?: string
  capacity?: number
  imageUrl?: string
  description?: string
  isExternal?: boolean
  createdAt: string
  updatedAt: string
  features: VenueFeature[]
}

// Table state
const columnVisibility = ref({})
// Hoisted, not inline: an inline object builds a fresh options bag and
// row-model function per render (ADR-0012).
const paginationOptions = { getPaginationRowModel: getPaginationRowModel() }
const rowSelection = ref<Record<string, boolean>>({})
const { pagination, page, resetPage } = useTablePagination(10)

// Server-rendered, with useRequestFetch to forward the session cookie
// (ADR-0013).
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData(
  'admin-venues', () => requestFetch<Venue[]>('/api/venues'))

/**
 * **Always an array, never null**: `data ?? []` mints a new identity per
 * render and sends UTable into a loop (ADR-0012).
 */
const rows = computed<Venue[]>(() => data.value ?? [])

/**
 * Search here rather than TanStack's `columnFilters`, so the footer can report
 * the match count without re-walking the row model (ADR-0012).
 */
const search = ref('')
const filteredRows = computed<Venue[]>(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return rows.value
  return rows.value.filter(venue =>
    venue.name.toLowerCase().includes(query)
    || (venue.address ?? '').toLowerCase().includes(query),
  )
})

// Reset to the first page when the result set shrinks under the cursor,
// otherwise a search from page 3 lands on an empty table.
watch(search, resetPage)

const selectedCount = computed(() => Object.keys(rowSelection.value).length)

// Selected venue for editing or deletion
const venueToEdit = ref<Venue | null>(null)
const manageFeaturesOpen = ref(false)

async function deleteVenue(venue: Venue) {
  const confirmed = await confirm({
    title: `Delete ${venue.name}?`,
    description: 'This permanently deletes the venue and its images, and may affect performances already scheduled there. It cannot be undone.',
    confirmLabel: 'Delete venue',
    confirmColor: 'error',
  })
  if (!confirmed) return

  try {
    await $fetch(`/api/venues/${venue.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Venue deleted',
      description: `${venue.name} has been removed`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to delete venue'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
}

// Get row actions for dropdown
function getRowItems(row: Row<Venue>) {
  const venue = row.original

  return [
    {
      type: 'label' as const,
      label: 'Actions',
    },
    {
      label: 'Copy venue ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(venue.id)
        toast.add({
          title: 'Copied to clipboard',
          description: 'Venue ID copied to clipboard',
        })
      },
    },
    {
      type: 'separator' as const,
    },
    {
      label: 'Edit venue',
      icon: 'i-lucide-pencil',
      onSelect() {
        venueToEdit.value = venue
      },
    },
    {
      type: 'separator' as const,
    },
    {
      label: 'Delete venue',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() {
        deleteVenue(venue)
      },
    },
  ]
}

// Define table columns
const columns: TableColumn<Venue>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        'modelValue': table.getIsSomePageRowsSelected()
          ? 'indeterminate'
          : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Select all',
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          row.toggleSelected(!!value),
        'ariaLabel': 'Select row',
      }),
  },
  {
    accessorKey: 'name',
    header: 'Venue',
    cell: ({ row }) => {
      const venue = row.original
      return h('div', { class: 'flex items-center gap-3' }, [
        venue.imageUrl
          ? h('img', {
              src: `/images/${venue.imageUrl}`,
              alt: venue.name,
              class: 'w-10 h-10 rounded object-cover',
            })
          : h('div', {
              class: 'w-10 h-10 rounded bg-neutral-500/10 flex items-center justify-center',
            }, h('span', { class: 'text-lg' }, '🏛️')),
        h('div', undefined, [
          h('div', { class: 'flex items-center gap-2' }, [
            h('p', { class: 'font-medium text-highlighted' }, venue.name),
            venue.isExternal
              ? h(UBadge, { size: 'sm', variant: 'subtle', color: 'neutral' }, () => 'Not ours')
              : null,
          ]),
          h('p', { class: 'text-sm text-muted' }, venue.address || 'No address'),
        ]),
      ])
    },
  },
  {
    accessorKey: 'capacity',
    header: 'Capacity',
    cell: ({ row }) => {
      const capacity = row.original.capacity
      return h('span', { class: 'text-sm' }, capacity ? `${capacity} seats` : 'Not set')
    },
  },
  {
    accessorKey: 'features',
    header: 'Features',
    cell: ({ row }) => {
      const features = row.original.features || []
      if (features.length === 0) {
        return h('span', { class: 'text-sm text-muted' }, 'None')
      }
      return h('div', { class: 'flex flex-wrap gap-1' }, features.slice(0, 3).map(feature =>
        h('span', {
          class: 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-500/10 text-neutral-500',
        }, [
          feature.icon ? h('span', undefined, feature.icon) : null,
          feature.name,
        ]),
      ).concat(
        features.length > 3
          ? [h('span', { class: 'text-xs text-muted' }, `+${features.length - 3} more`)]
          : [],
      ))
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: { align: 'end' },
            items: getRowItems(row),
          },
          () =>
            h(UButton, {
              color: 'neutral',
              variant: 'ghost',
              icon: 'i-lucide-ellipsis-vertical',
              class: 'ml-auto',
            }),
        ),
      )
    },
  },
]
</script>

<template>
  <AdminPage>
    <AdminTableToolbar>
      <template #left>
        <p class="text-muted">
          Manage venue locations and features
        </p>
      </template>
      <template #right>
        <UButton
          label="Manage features"
          color="neutral"
          variant="outline"
          icon="i-lucide-list"
          @click="manageFeaturesOpen = true"
        />
        <VenueCreateModal @refresh="refresh" />
      </template>
    </AdminTableToolbar>

    <AdminFetchError
      v-if="error"
      :error="error"
      title="Could not load venues"
      :on-retry="refresh"
    />

    <AdminTableToolbar>
      <template #left>
        <UInput
          v-model="search"
          placeholder="Search venues…"
          icon="i-lucide-search"
          class="flex-1"
        />
      </template>
      <template #right>
        <AdminTableColumnToggle
          :table="table"
          :labels="{ name: 'Venue' }"
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
          icon="i-lucide-building"
          :title="search ? 'No venues match your search' : 'No venues yet'"
          :description="search ? 'Try a different name or address.' : 'Create a venue to start scheduling performances.'"
        />
      </template>
    </UTable>

    <AdminTablePagination
      v-model:page="page"
      :total="filteredRows.length"
      :limit="pagination.pageSize"
      :selected="selectedCount"
      label="venue"
      :suffix="search ? 'matching' : undefined"
    />

    <VenueEditModal
      :venue="venueToEdit"
      @close="venueToEdit = null"
      @refresh="() => { refresh(); venueToEdit = null }"
    />

    <VenueFeatureModal
      v-model:open="manageFeaturesOpen"
      @refresh="refresh"
    />
  </AdminPage>
</template>
