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
const confirm = useConfirm()
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
const { data: rawData, status, error, refresh } = await useAsyncData(
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
 * Search here rather than through TanStack's `columnFilters`, so the footer can
 * report the match count without re-walking the table's row model and the input
 * is a plain `v-model` instead of a find-and-mutate on a filter array.
 */
const search = ref('')
const filteredRows = computed<TicketType[]>(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return rows.value
  return rows.value.filter(tt =>
    tt.name.toLowerCase().includes(query)
    || (tt.description ?? '').toLowerCase().includes(query),
  )
})

// UPagination counts from 1; TanStack indexes from 0.
const page = computed({
  get: () => pagination.value.pageIndex + 1,
  set: (value: number) => { pagination.value.pageIndex = value - 1 },
})

watch([search, showArchived], () => {
  pagination.value.pageIndex = 0
})

const selectedCount = computed(() => Object.keys(rowSelection.value).length)

/**
 * Hoisted for the same reason: an inline `:pagination-options="{ ... }"` builds
 * a fresh options object *and* a fresh row-model function on every render,
 * which is enough on its own to make the table rebuild in a loop.
 */
const paginationOptions = { getPaginationRowModel: getPaginationRowModel() }

const archivedCount = computed(() => rawData.value?.filter(tt => tt.archived).length ?? 0)

const ticketTypeToEdit = ref<TicketType | null>(null)

/** Free is a price, and reads better than £0.00 on a list of them. */
function formatTicketPrice(pence: number): string {
  return pence === 0 ? 'Free' : formatMoney(pence)
}

async function deleteTicketType(ticketType: TicketType) {
  const confirmed = await confirm({
    title: `Delete '${ticketType.name}'?`,
    description: 'This permanently deletes the ticket type and cannot be undone. If any issued tickets reference it, the deletion will be refused — archive it instead.',
    confirmLabel: 'Delete',
    confirmColor: 'error',
  })
  if (!confirmed) return

  try {
    await $fetch(`/api/ticket-types/${ticketType.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Ticket type deleted',
      description: `${ticketType.name} has been removed`,
      icon: 'i-lucide-check',
      color: 'success',
    })
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
        deleteTicketType(tt)
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
      return h('span', { class: 'font-mono text-sm' }, formatTicketPrice(row.original.price))
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
  <AdminPage>
    <AdminTableToolbar>
      <template #left>
        <p class="text-muted">
          Manage default ticket types, prices, and availability settings
        </p>
      </template>
      <template #right>
        <TicketTypeCreateModal @refresh="refresh" />
      </template>
    </AdminTableToolbar>

    <AdminFetchError
      v-if="error"
      :error="error"
      title="Could not load ticket types"
      :on-retry="refresh"
    />

    <AdminTableToolbar>
      <template #left>
        <UInput
          v-model="search"
          placeholder="Search ticket types…"
          icon="i-lucide-search"
          class="flex-1"
        />
      </template>
      <template #right>
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
          :labels="{ activeByDefault: 'Active by default', archived: 'Status' }"
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
          icon="i-lucide-ticket"
          :title="search ? 'No ticket types match your search' : 'No ticket types yet'"
          :description="search ? 'Try a different name.' : 'Add a ticket type to start pricing performances.'"
        />
      </template>
    </UTable>

    <AdminTablePagination
      v-model:page="page"
      :total="filteredRows.length"
      :limit="pagination.pageSize"
      :selected="selectedCount"
      label="ticket type"
      :suffix="search ? 'matching' : undefined"
    />

    <TicketTypeEditModal
      :ticket-type="ticketTypeToEdit"
      @close="ticketTypeToEdit = null"
      @refresh="() => { refresh(); ticketTypeToEdit = null }"
    />
  </AdminPage>
</template>
