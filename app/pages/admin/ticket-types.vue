/**
 * Admin: Manage Ticket Types Page
 *
 * Administrative interface for managing ticket types.
 *
 * Features:
 * - Table view of ticket types (archived ones hidden until asked for)
 * - Search by name
 * - View price, active-by-default status, and description
 * - Archive a type that will never be sold again, or restore one
 * - Create new ticket types
 * - Edit existing ticket types
 * - Delete ticket types (blocked if issued tickets reference them)
 *
 * Data Loading:
 * - GET /api/ticket-types
 *
 * Data Mutations:
 * - POST /api/ticket-types (create)
 * - PUT /api/ticket-types/:id (update)
 * - DELETE /api/ticket-types/:id (delete)
 *
 * @route /admin/ticket-types
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
const UBadge = resolveComponent('UBadge')

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Ticket Types',
})

const toast = useToast()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = useTemplateRef<any>('table')

interface TicketType {
  id: string
  name: string
  description?: string | null
  price: number // in pence
  activeByDefault: boolean
  /** Retired: never offered again, but still prices its historic tickets. */
  archived: boolean
  createdAt: string
  updatedAt: string
}

// Table state
const columnFilters = ref([{ id: 'name', value: '' }])
// `{}` rather than `undefined`: an undefined v-model means the table's first
// internal sync writes a value back to the parent, which is one more
// parent-render-during-child-setup than this page can afford. See the note on
// `rows` below.
const columnVisibility = ref({})
const rowSelection = ref<Record<string, boolean>>({})
const pagination = ref({ pageSize: 15, pageIndex: 0 })
const showArchived = ref(false)

// `includeArchived` because this is the one screen that has to see retired
// types — it is where they are archived and restored. Everything else gets the
// live ones by default.
// Server-rendered, so the table arrives populated instead of appearing a moment
// later. `$fetch: useRequestFetch()` is not optional here: every admin endpoint
// is behind authorize(), and a plain useFetch running on the server does not
// forward the incoming session cookie — it would 403 during SSR. See
// docs/02-architecture.md §Fetching in the admin area.
const requestFetch = useRequestFetch()
const { data: rawData, status, refresh } = await useAsyncData(
  'admin-ticket-types',
  () => requestFetch<TicketType[]>('/api/ticket-types', { query: { includeArchived: 'true' } }),
)

/**
 * Rows for the table. **Always an array, never null.**
 *
 * This is load-bearing, not tidiness. The template used to bind
 * `:data="data ?? []"` against a computed that returned `null` until the fetch
 * resolved — so every render produced a *brand-new* empty array. UTable rebuilds
 * its TanStack row models whenever `data` changes identity, and rebuilding
 * writes back through `v-model:pagination` / `:row-selection` /
 * `:column-visibility`, which re-renders this page, which allocates another new
 * array. That is a render loop with no fixed point, and it locked the tab up.
 *
 * It bit hardest arriving by client-side navigation, because there was no
 * server-rendered payload to land on and the fetch was `lazy`, guaranteeing a
 * window where the data was null — exactly the "navigate to ticket types and
 * everything freezes" report. The fetch is server-rendered now, which closes
 * that window, but the binding must still never allocate per render.
 *
 * A computed caches, so this identity only changes when its dependencies do.
 * Keep it that way: do not reintroduce `?? []` at the binding.
 *
 * (Hiding is by `archived`, not `activeByDefault` — the two answer different
 * questions; see docs/06-pricing-and-ticket-types.md.)
 */
const rows = computed<TicketType[]>(() => {
  const all = rawData.value ?? []
  return showArchived.value ? all : all.filter(tt => !tt.archived)
})

/**
 * Hoisted for the same reason: an inline `:pagination-options="{ ... }"` builds
 * a fresh options object *and* a fresh row-model function on every render,
 * which is enough on its own to make the table rebuild in a loop.
 */
const paginationOptions = { getPaginationRowModel: getPaginationRowModel() }

const archivedCount = computed(() => rawData.value?.filter(tt => tt.archived).length ?? 0)

const ticketTypeToEdit = ref<TicketType | null>(null)
const ticketTypeToDelete = ref<TicketType | null>(null)
const deleteModalOpen = ref(false)
const isDeleting = ref(false)

// Format pence to £
function formatPrice(pence: number): string {
  return pence === 0 ? 'Free' : `£${(pence / 100).toFixed(2)}`
}

async function deleteSingleTicketType() {
  if (!ticketTypeToDelete.value) return
  isDeleting.value = true
  try {
    await $fetch(`/api/ticket-types/${ticketTypeToDelete.value.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Ticket type deleted',
      description: `${ticketTypeToDelete.value.name} has been removed`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    deleteModalOpen.value = false
    ticketTypeToDelete.value = null
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to delete ticket type'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isDeleting.value = false
  }
}

const isArchiving = ref(false)

/**
 * Retire a type, or bring it back.
 *
 * Deliberately not a delete: DELETE is refused once any ticket references the
 * type, and those references are exactly what make the historic data readable —
 * a 2019 ticket still has to resolve its name and price. Archiving is the
 * answer for "we are never selling this again": it disappears from the pickers
 * and the override screens while the history keeps working.
 */
async function setArchived(tt: TicketType, archived: boolean) {
  if (isArchiving.value) return
  isArchiving.value = true
  try {
    await $fetch(`/api/ticket-types/${tt.id}`, { method: 'PUT', body: { archived } })
    toast.add({
      title: archived ? `${tt.name} archived` : `${tt.name} restored`,
      description: archived
        ? 'It will no longer appear when selling or setting prices.'
        : 'It can be sold again.',
      icon: 'i-lucide-check-circle',
      color: 'success',
    })
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: archived ? 'Could not archive this ticket type' : 'Could not restore this ticket type',
      description: getErrorMessage(error, 'Please try again'),
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
  finally {
    isArchiving.value = false
  }
}

function getRowItems(row: Row<TicketType>) {
  const tt = row.original
  return [
    {
      type: 'label' as const,
      label: 'Actions',
    },
    {
      label: 'Copy ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(tt.id)
        toast.add({ title: 'Copied to clipboard', description: 'Ticket type ID copied' })
      },
    },
    { type: 'separator' as const },
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect() {
        ticketTypeToEdit.value = tt
      },
    },
    {
      label: tt.archived ? 'Restore' : 'Archive',
      icon: tt.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive',
      onSelect() {
        setArchived(tt, !tt.archived)
      },
    },
    { type: 'separator' as const },
    {
      label: 'Delete',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() {
        ticketTypeToDelete.value = tt
        deleteModalOpen.value = true
      },
    },
  ]
}

const columns: TableColumn<TicketType>[] = [
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
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => {
      const tt = row.original
      return h('div', undefined, [
        h('p', { class: 'font-medium text-highlighted' }, tt.name),
        tt.description
          ? h('p', { class: 'text-sm text-muted truncate max-w-xs' }, tt.description)
          : null,
      ])
    },
  },
  {
    accessorKey: 'price',
    header: 'Default price',
    cell: ({ row }) => {
      return h('span', { class: 'font-mono text-sm' }, formatPrice(row.original.price))
    },
  },
  {
    accessorKey: 'activeByDefault',
    header: 'Active by default',
    cell: ({ row }) => {
      const active = row.original.activeByDefault
      return h(UBadge, {
        label: active ? 'Yes' : 'No',
        color: active ? 'success' : 'neutral',
        variant: 'subtle',
      })
    },
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
  <div class="min-h-screen flex flex-col gap-4 p-6">
    <div class="flex w-full items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Ticket Types
        </h1>
        <p class="text-muted">
          Manage default ticket types, prices, and availability settings
        </p>
      </div>

      <TicketTypeCreateModal @refresh="refresh" />
    </div>

    <div class="flex gap-3">
      <UInput
        :model-value="columnFilters.find(f => f.id === 'name')?.value"
        placeholder="Search ticket types..."
        icon="i-lucide-search"
        class="flex-1"
        @update:model-value="(value: string) => {
          const filter = columnFilters.find(f => f.id === 'name')
          if (filter) filter.value = value
        }"
      />

      <UButton
        v-if="archivedCount > 0"
        :label="showArchived ? 'Hide archived' : `Show archived (${archivedCount})`"
        :icon="showArchived ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        color="neutral"
        variant="outline"
        @click="showArchived = !showArchived"
      />

      <UDropdownMenu
        :items="
          table?.tableApi
            ?.getAllColumns()
            .filter((column: any) => column.getCanHide())
            .map((column: any) => ({
              label: column.id === 'name'
                ? 'Name'
                : column.id === 'activeByDefault'
                  ? 'Active by default'
                  : column.id === 'archived'
                    ? 'Status'
                    : column.id.charAt(0).toUpperCase() + column.id.slice(1),
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
      :data="rows"
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

      <UPagination
        :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
        :items-per-page="table?.tableApi?.getState().pagination.pageSize"
        :total="table?.tableApi?.getFilteredRowModel().rows.length"
        @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
      />
    </div>

    <!-- Edit Modal -->
    <TicketTypeEditModal
      :ticket-type="ticketTypeToEdit"
      @close="ticketTypeToEdit = null"
      @refresh="() => { refresh(); ticketTypeToEdit = null }"
    />

    <!-- Delete Confirmation Modal -->
    <UModal
      v-model:open="deleteModalOpen"
      :title="`Delete '${ticketTypeToDelete?.name || 'ticket type'}'`"
      description="Are you sure? This action cannot be undone."
    >
      <template #body>
        <div class="space-y-4">
          <div class="p-3 rounded-md bg-error/10 border border-error/20">
            <div class="flex gap-2">
              <UIcon
                name="i-lucide-info"
                class="text-error shrink-0 mt-0.5"
              />
              <div class="text-sm text-error">
                <p class="font-medium mb-1">
                  This will permanently delete the ticket type.
                </p>
                <p>
                  If any issued tickets reference this type, deletion will be blocked.
                </p>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="subtle"
              :disabled="isDeleting"
              @click="deleteModalOpen = false"
            />
            <UButton
              label="Delete"
              color="error"
              :loading="isDeleting"
              @click="deleteSingleTicketType"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
