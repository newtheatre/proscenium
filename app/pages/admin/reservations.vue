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
 * - GET /api/reservations (server-side paginated, filtered and searched)
 * - GET /api/admin/reservation-counts (status tallies)
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

const columnVisibility = ref({})

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

// Filtering, searching and paging all happen on the server. There are 30,000+
// reservations: fetching them to filter in the browser was ~18 MB per page load.
const pageSize = 25
const currentPage = ref(1)

const debouncedSearch = useDebouncedRef(searchQuery, {
  onSettle: () => { currentPage.value = 1 },
})

watch(statusFilter, () => {
  currentPage.value = 1
})

// requestFetch rather than a bare $fetch: this runs on the server for the first
// render, where only a forwarded session cookie satisfies authorize().
// Searching, filtering and paging afterwards re-run it on the client, which
// does not suspend the page.
const requestFetch = useRequestFetch()
const { data, status, error, refresh } = await useAsyncData(
  'admin-reservations',
  () => requestFetch<{ rows: Reservation[], total: number }>('/api/reservations', {
    query: {
      page: currentPage.value,
      limit: pageSize,
      q: debouncedSearch.value || undefined,
      status: statusFilter.value && statusFilter.value !== 'ALL' ? statusFilter.value : undefined,
    },
  }),
  {
    default: () => ({ rows: [] as Reservation[], total: 0 }),
    watch: [currentPage, debouncedSearch, statusFilter],
  },
)

const filteredData = computed(() => data.value?.rows ?? [])
const totalCount = computed(() => data.value?.total ?? 0)
const isFiltered = computed(() => Boolean(debouncedSearch.value) || statusFilter.value !== 'ALL')

// ── State summary counts ──────────────────────────────────────────────────────
// One GROUP BY on the server, rather than five passes over every reservation
// in the browser.
const { data: counts, refresh: refreshCounts } = await useAsyncData(
  'admin-reservation-counts',
  () => requestFetch<{ byStatus: Record<string, number>, total: number }>('/api/admin/reservation-counts'),
  { default: () => ({ byStatus: {} as Record<string, number>, total: 0 }) },
)

const statusCounts = computed(() => counts.value?.byStatus ?? {})

async function refreshAll() {
  await Promise.all([refresh(), refreshCounts()])
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
          formatDateTime(r.performance.startsAt),
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
    cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, formatDateTime(row.original.createdAt)),
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
  <AdminPage>
    <AdminTableToolbar>
      <template #left>
        <p class="text-muted">
          View and manage all customer reservations
        </p>
      </template>
    </AdminTableToolbar>

    <AdminFetchError
      v-if="error"
      :error="error"
      title="Could not load reservations"
      :on-retry="refreshAll"
    />

    <!-- Status summary pills -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="(cfg, key) in STATUS_CONFIG"
        :key="key"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
        :class="statusFilter === key
          ? 'bg-primary text-white border-primary'
          : 'bg-elevated border-default text-muted hover:text-default'"
        :aria-pressed="statusFilter === key"
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

    <AdminTableToolbar>
      <template #left>
        <UInput
          v-model="searchQuery"
          placeholder="Search by ref, customer, show or venue…"
          icon="i-lucide-search"
          class="flex-1"
        />
      </template>
      <template #right>
        <USelect
          v-model="statusFilter"
          :items="statusOptions"
          value-key="value"
          label-key="label"
          class="w-44"
        />
        <AdminTableColumnToggle :table="table" />
      </template>
    </AdminTableToolbar>

    <!-- Paging is server-side, so the table renders exactly the page it is given. -->
    <UTable
      ref="table"
      v-model:column-visibility="columnVisibility"
      class="shrink-0"
      :data="filteredData"
      :columns="columns"
      :loading="status === 'pending'"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-bookmark-check"
          :title="isFiltered ? 'No reservations match these filters' : 'No reservations yet'"
          :description="isFiltered ? 'Try a different search term or status.' : 'Reservations appear here as customers book.'"
        />
      </template>
    </UTable>

    <AdminTablePagination
      v-model:page="currentPage"
      :total="totalCount"
      :limit="pageSize"
      label="reservation"
      :suffix="isFiltered ? 'matching' : undefined"
    />

    <ReservationEditModal
      :reservation="reservationToEdit"
      @close="reservationToEdit = null"
      @refresh="() => { refreshAll(); reservationToEdit = null }"
    />

    <ReservationTicketsModal
      :reservation-id="ticketsReservationId"
      :booking-ref="ticketsBookingRef"
      @close="ticketsReservationId = null; ticketsBookingRef = null"
      @refresh="refresh"
    />
  </AdminPage>
</template>
