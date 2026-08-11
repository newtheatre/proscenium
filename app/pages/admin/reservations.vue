/**
 * Admin: Reservation Management Page
 *
 * Administrative interface for viewing and managing all reservations.
 *
 * Features:
 * - Table view of all reservations with selection
 * - Filter by status and search by booking reference or customer name
 * - View show, performance, venue and customer details inline
 * - Status badges (PENDING, COLLECTED, DOOR, CANCELLED, NO_SHOW)
 * - Edit reservation status and notes via modal
 * - Copy booking reference / reservation ID
 * - Pagination
 *
 * Data Loading:
 * - GET /api/reservations
 *
 * Data Mutations:
 * - PUT /api/reservations/:id (update status/notes)
 *
 * @route /admin/reservations
 * @authenticated
 * @admin-only
 */
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { Row } from '@tanstack/table-core'

const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UBadge = resolveComponent('UBadge')

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
  title: 'Reservations',
})

const toast = useToast()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = useTemplateRef<any>('table')

// ── Types ─────────────────────────────────────────────────────────────────────

interface Reservation {
  id: string
  bookingRef: string
  performanceId: string
  userId: string
  status: 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW'
  cancelledBy?: 'CUSTOMER' | 'STAFF' | null
  customerNotes?: string | null
  staffNotes?: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    email: string
    verified: boolean
  }
  performance: {
    id: string
    startsAt: string | number
    status: string
    show: { id: string, title: string, slug: string }
    venue: { id: string, name: string }
  }
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'warning' as const, icon: 'i-lucide-clock' },
  COLLECTED: { label: 'Collected', color: 'success' as const, icon: 'i-lucide-check-circle' },
  DOOR: { label: 'Door', color: 'info' as const, icon: 'i-lucide-door-open' },
  CANCELLED: { label: 'Cancelled', color: 'error' as const, icon: 'i-lucide-x-circle' },
  NO_SHOW: { label: 'No show', color: 'neutral' as const, icon: 'i-lucide-user-x' },
}

// ── Table state ───────────────────────────────────────────────────────────────

const columnVisibility = ref()
const pagination = ref({ pageSize: 15, pageIndex: 0 })

const searchQuery = ref('')
const statusFilter = ref<string>('ALL')

const statusOptions = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Collected', value: 'COLLECTED' },
  { label: 'Door', value: 'DOOR' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'No show', value: 'NO_SHOW' },
]

// ── Data fetching ─────────────────────────────────────────────────────────────

const { data, status, refresh } = await useFetch<Reservation[]>('/api/reservations', {
  lazy: true,
})

// ── Filtering ─────────────────────────────────────────────────────────────────

const filteredData = computed(() => {
  let rows = data.value ?? []

  if (statusFilter.value && statusFilter.value !== 'ALL') {
    rows = rows.filter(r => r.status === statusFilter.value)
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter(r =>
      r.bookingRef.toLowerCase().includes(q)
      || r.user.name.toLowerCase().includes(q)
      || r.user.email.toLowerCase().includes(q)
      || r.performance.show.title.toLowerCase().includes(q)
      || r.performance.venue.name.toLowerCase().includes(q),
    )
  }

  return rows
})

// ── State summary counts ──────────────────────────────────────────────────────

const statusCounts = computed(() => {
  const all = data.value ?? []
  return Object.fromEntries(
    Object.keys(STATUS_CONFIG).map(s => [s, all.filter(r => r.status === s).length]),
  ) as Record<string, number>
})

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(val: string | number | null | undefined): string {
  if (!val) return '—'
  const d = new Date(typeof val === 'number' ? val * 1000 : val)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
}

// ── Edit modal ────────────────────────────────────────────────────────────────

const reservationToEdit = ref<Reservation | null>(null)
const ticketsReservationId = ref<string | null>(null)
const ticketsBookingRef = ref<string | null>(null)

// ── Row actions ───────────────────────────────────────────────────────────────

function getRowItems(row: Row<Reservation>) {
  const r = row.original

  return [
    {
      type: 'label' as const,
      label: 'Actions',
    },
    {
      label: 'Copy booking ref',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(r.bookingRef)
        toast.add({ title: 'Copied', description: `Booking ref ${r.bookingRef} copied` })
      },
    },
    {
      label: 'Copy reservation ID',
      icon: 'i-lucide-hash',
      onSelect() {
        navigator.clipboard.writeText(r.id)
        toast.add({ title: 'Copied', description: 'Reservation ID copied to clipboard' })
      },
    },
    { type: 'separator' as const },
    {
      label: 'Manage tickets',
      icon: 'i-lucide-ticket',
      onSelect() {
        ticketsReservationId.value = r.id
        ticketsBookingRef.value = r.bookingRef
      },
    },
    {
      label: 'Edit reservation',
      icon: 'i-lucide-pencil',
      onSelect() {
        reservationToEdit.value = r
      },
    },
  ]
}

// ── Table columns ─────────────────────────────────────────────────────────────

const columns: TableColumn<Reservation>[] = [
  {
    accessorKey: 'bookingRef',
    header: 'Booking Ref',
    cell: ({ row }) => {
      return h('span', {
        class: 'font-mono font-medium text-highlighted tracking-wide',
      }, row.original.bookingRef)
    },
  },
  {
    id: 'show',
    header: 'Show / Performance',
    cell: ({ row }) => {
      const r = row.original
      return h('div', undefined, [
        h('p', { class: 'font-medium text-highlighted text-sm leading-tight' }, r.performance.show.title),
        h('p', { class: 'text-xs text-muted mt-0.5' }, [
          r.performance.venue.name,
          ' · ',
          formatDate(r.performance.startsAt),
        ]),
      ])
    },
  },
  {
    id: 'customer',
    header: 'Customer',
    cell: ({ row }) => {
      const u = row.original.user
      return h('div', undefined, [
        h('p', { class: 'text-sm text-highlighted leading-tight' }, u.name),
        h('p', { class: 'text-xs text-muted mt-0.5' }, u.email),
      ])
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const cfg = STATUS_CONFIG[row.original.status]
      return h(UBadge, {
        label: cfg.label,
        color: cfg.color,
        variant: 'subtle',
        icon: cfg.icon,
      })
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Booked',
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, formatDate(row.original.createdAt)),
  },
  {
    id: 'actions',
    cell: ({ row }) =>
      h('div', { class: 'text-right' },
        h(UDropdownMenu, {
          content: { align: 'end' },
          items: getRowItems(row),
        }, () =>
          h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            icon: 'i-lucide-ellipsis-vertical',
            class: 'ml-auto',
          }),
        ),
      ),
  },
]
</script>

<template>
  <div class="min-h-screen flex flex-col gap-4 p-6">
    <!-- Header -->
    <div class="flex w-full items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Reservations
        </h1>
        <p class="text-muted">
          View and manage all customer reservations
        </p>
      </div>
    </div>

    <!-- Status summary pills -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="(cfg, key) in STATUS_CONFIG"
        :key="key"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
        :class="statusFilter === key
          ? 'bg-primary text-white border-primary'
          : 'bg-elevated border-default text-muted hover:text-default'"
        @click="statusFilter = statusFilter === key ? 'ALL' : key"
      >
        <UIcon
          :name="cfg.icon"
          class="size-3.5"
        />
        {{ cfg.label }}
        <span class="opacity-70">({{ statusCounts[key] ?? 0 }})</span>
      </button>
    </div>

    <!-- Filters row -->
    <div class="flex gap-3">
      <UInput
        v-model="searchQuery"
        placeholder="Search by ref, customer, show or venue…"
        icon="i-lucide-search"
        class="flex-1"
      />

      <USelect
        v-model="statusFilter"
        :items="statusOptions"
        value-key="value"
        label-key="label"
        class="w-44"
      />

      <UDropdownMenu
        :items="
          table?.tableApi
            ?.getAllColumns()
            .filter((col: any) => col.getCanHide())
            .map((col: any) => ({
              label: col.id.charAt(0).toUpperCase() + col.id.slice(1),
              type: 'checkbox' as const,
              checked: col.getIsVisible(),
              onUpdateChecked(checked: boolean) {
                table?.tableApi?.getColumn(col.id)?.toggleVisibility(!!checked)
              },
              onSelect(e?: Event) { e?.preventDefault() },
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

    <!-- Table -->
    <UTable
      ref="table"
      v-model:column-visibility="columnVisibility"
      v-model:pagination="pagination"
      :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
      class="shrink-0"
      :data="filteredData"
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

    <!-- Footer -->
    <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
      <div class="text-sm text-muted">
        {{ filteredData.length }} reservation(s) shown
        <template v-if="data && data.length !== filteredData.length">
          ({{ data.length }} total)
        </template>
      </div>

      <div class="flex gap-1.5">
        <UPagination
          :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
          :items-per-page="table?.tableApi?.getState().pagination.pageSize"
          :total="filteredData.length"
          @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
        />
      </div>
    </div>

    <!-- Edit Reservation Modal -->
    <ReservationEditModal
      :reservation="reservationToEdit"
      @close="reservationToEdit = null"
      @refresh="() => { refresh(); reservationToEdit = null }"
    />

    <!-- Manage Tickets Slideover -->
    <ReservationTicketsModal
      :reservation-id="ticketsReservationId"
      :booking-ref="ticketsBookingRef"
      @close="ticketsReservationId = null; ticketsBookingRef = null"
      @refresh="refresh"
    />
  </div>
</template>
