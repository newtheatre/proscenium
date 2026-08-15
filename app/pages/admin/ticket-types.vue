/**
 * Admin: ticket types. Archived ones are hidden until asked for; this is where
 * they are archived and restored (ADR-0010).
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

// `{}` rather than `undefined`: an undefined v-model makes the table's first
// internal sync write back to the parent (ADR-0012).
const columnVisibility = ref({})
const rowSelection = ref<Record<string, boolean>>({})
const { pagination, page, resetPage } = useTablePagination(15)
const showArchived = ref(false)

// `includeArchived` because this is the one screen that has to see retired
// types. Server-rendered, and `useRequestFetch()` is not optional (ADR-0013).
const requestFetch = useRequestFetch()
const { data: rawData, status, error, refresh } = await useAsyncData(
  'admin-ticket-types',
  () => requestFetch<TicketType[]>('/api/ticket-types', { query: { includeArchived: 'true' } }),
)

/**
 * **Always an array, never null** — a fresh array per render sends UTable into
 * a loop, which locks the tab up (ADR-0012).
 */
const rows = computed<TicketType[]>(() => {
  const all = rawData.value ?? []
  return showArchived.value ? all : all.filter(tt => !tt.archived)
})

/**
 * Search here rather than TanStack's `columnFilters`, so the footer can report
 * the match count without re-walking the row model (ADR-0012).
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

watch([search, showArchived], resetPage)

const selectedCount = computed(() => Object.keys(rowSelection.value).length)

/**
 * Hoisted: an inline options object builds a fresh row-model function every
 * render (ADR-0012).
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
 * Retire a type, or bring it back — deliberately not a delete (ADR-0010).
 * A 2019 ticket still has to resolve its name and price.
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
