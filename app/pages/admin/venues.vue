/**
 * Admin: Manage Venues Page
 *
 * Administrative interface for venue and feature management.
 *
 * Features:
 * - Table view of all venues with selection
 * - Search by name or address
 * - View venue details (capacity, features, status)
 * - Create new venues
 * - Update venue information and features
 * - Upload/manage venue images
 * - Delete venue(s) (confirmation required)
 * - Manage venue features (accessibility, amenities)
 *
 * Data Loading:
 * - GET /api/venues
 * - GET /api/venue-features
 *
 * Data Mutations:
 * - POST /api/venues (create venue)
 * - PUT /api/venues/:id (update venue)
 * - DELETE /api/venues/:id (delete venue)
 * - POST /api/venues/:id/image (upload image)
 * - DELETE /api/venues/:id/image (delete image)
 * - POST /api/venue-features (create feature)
 * - PUT /api/venue-features/:id (update feature)
 * - DELETE /api/venue-features/:id (delete feature)
 *
 * @route /admin/venues
 * @authenticated
 * @admin-only
 */
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { Row } from '@tanstack/table-core'

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Venue Management',
})

const toast = useToast()
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
  createdAt: string
  updatedAt: string
  features: VenueFeature[]
}

// Table state
const columnFilters = ref([{
  id: 'name',
  value: '',
}])
const columnVisibility = ref({})
// Hoisted, not inline in the template: an inline object builds a fresh options
// bag and row-model function per render, which makes the table rebuild every
// time. Harmless here only because `:data` is a stable ref — see the note in
// admin/ticket-types.vue.
const paginationOptions = { getPaginationRowModel: getPaginationRowModel() }
const rowSelection = ref<Record<string, boolean>>({})
const pagination = ref({
  pageSize: 10,
  pageIndex: 0,
})

// Fetch venues
const { data, status, refresh } = await useFetch<Venue[]>('/api/venues', {
  lazy: true,
})

// Selected venue for editing or deletion
const venueToEdit = ref<Venue | null>(null)
const venueToDelete = ref<Venue | null>(null)
const deleteModalOpen = ref(false)
const manageFeaturesOpen = ref(false)

// Delete single venue
async function deleteSingleVenue() {
  if (!venueToDelete.value) return

  try {
    await $fetch(`/api/venues/${venueToDelete.value.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Venue deleted',
      description: `${venueToDelete.value.name} has been removed`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    deleteModalOpen.value = false
    venueToDelete.value = null
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
        venueToDelete.value = venue
        deleteModalOpen.value = true
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
          h('p', { class: 'font-medium text-highlighted' }, venue.name),
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
  <div class="min-h-screen flex flex-col gap-4 p-6">
    <div class="flex w-full items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Venues
        </h1>
        <p class="text-muted">
          Manage venue locations and features
        </p>
      </div>

      <div class="flex gap-2">
        <UButton
          label="Manage Features"
          color="neutral"
          variant="outline"
          icon="i-lucide-list"
          @click="manageFeaturesOpen = true"
        />
        <VenueCreateModal @refresh="refresh" />
      </div>
    </div>

    <div class="flex gap-3">
      <UInput
        :model-value="columnFilters.find((filter) => filter.id ==='name')?.value"
        placeholder="Search venues..."
        icon="i-lucide-search"
        class="flex-1"
        @update:model-value="(value: string) => {
          const filter = columnFilters.find((filter) => filter.id === 'name')
          if (filter) filter.value = value
        }"
      />

      <UDropdownMenu
        :items="
          table?.tableApi
            ?.getAllColumns()
            .filter((column: any) => column.getCanHide())
            .map((column: any) => ({
              label: column.id === 'name' ? 'Venue' : column.id.charAt(0).toUpperCase() + column.id.slice(1),
              type: 'checkbox' as const,
              checked: column.getIsVisible(),
              onUpdateChecked(checked: boolean) {
                table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
              },
              onSelect(e?: Event) {
                e?.preventDefault()
              },
            }))
        "
        :content="{ align: 'end' }"
      >
        <UButton
          label="Display"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-settings-2"
        />
      </UDropdownMenu>
    </div>

    <UTable
      ref="table"
      v-model:column-filters="columnFilters"
      v-model:column-visibility="columnVisibility"
      v-model:row-selection="rowSelection"
      v-model:pagination="pagination"
      :pagination-options="paginationOptions"
      class="shrink-0"
      :data="data"
      :columns="columns"
      :loading="status === 'pending'"
      :ui="{
        base: 'table-fixed border-separate border-spacing-0',
        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
        tbody: '[&>tr]:last:[&>td]:border-b-0',
        th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
        td: 'border-b border-default',
      }"
    />

    <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
      <div class="text-sm text-muted">
        {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }} of
        {{ table?.tableApi?.getFilteredRowModel().rows.length || 0 }} row(s) selected.
      </div>

      <div class="flex gap-1.5">
        <UPagination
          :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
          :items-per-page="table?.tableApi?.getState().pagination.pageSize"
          :total="table?.tableApi?.getFilteredRowModel().rows.length"
          @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
        />
      </div>
    </div>

    <!-- Edit Venue Modal -->
    <VenueEditModal
      :venue="venueToEdit"
      @close="venueToEdit = null"
      @refresh="() => { refresh(); venueToEdit = null }"
    />

    <!-- Delete Venue Modal -->
    <UModal
      v-model:open="deleteModalOpen"
      :title="`Delete ${venueToDelete?.name ||'venue'}`"
      :description="`Are you sure? This action cannot be undone.`"
    >
      <template #body>
        <div
          v-if="venueToDelete"
          class="space-y-4"
        >
          <div class="p-3 rounded-md bg-error/10 border border-error/20">
            <div class="flex gap-2">
              <UIcon
                name="i-lucide-info"
                class="text-error shrink-0 mt-0.5"
              />
              <div class="text-sm text-error">
                <p class="font-medium mb-1">
                  What happens when you delete this venue:
                </p>
                <ul class="list-disc list-inside space-y-1">
                  <li>Venue will be permanently deleted</li>
                  <li>All associated images will be removed</li>
                  <li>Related performances may be affected</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            @click="deleteModalOpen = false"
          />
          <UButton
            label="Delete Venue"
            color="error"
            @click="deleteSingleVenue"
          />
        </div>
      </template>
    </UModal>

    <!-- Manage Features Modal -->
    <VenueFeatureModal
      v-model:open="manageFeaturesOpen"
      @refresh="refresh"
    />
  </div>
</template>
