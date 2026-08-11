/**
 * Admin: Dashboard
 *
 * Overview of key operational and financial metrics for NNT.
 * Includes revenue summary, ticket sales, recent reservations, and a CSV export
 * tool designed for the treasurer.
 *
 * Data Loading:
 * - GET /api/admin/stats
 * - GET /api/shows (for the export show selector)
 *
 * @route /admin
 * @authenticated
 * @admin-only
 */
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({
  layout: 'admin',
  middleware: 'admin',
  title: 'Dashboard',
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface RevenueByShow {
  showId: string
  showTitle: string
  showStatus: string
  totalRevenuePence: number
  totalTickets: number
}

interface RecentReservation {
  id: string
  bookingRef: string
  status: 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW'
  createdAt: string
  user: { id: string, name: string, email: string }
  performance: {
    startsAt: string | number
    show: { id: string, title: string }
    venue: { id: string, name: string }
  }
}

interface Stats {
  activeShows: number
  upcomingPerformances: number
  totalRevenuePence: number
  totalTicketsSold: number
  reservationsByStatus: Array<{ status: string, count: number }>
  revenueByShow: RevenueByShow[]
  recentReservations: RecentReservation[]
}

interface Show {
  id: string
  title: string
  status: string
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'warning' as const },
  COLLECTED: { label: 'Collected', color: 'success' as const },
  DOOR: { label: 'Door', color: 'info' as const },
  CANCELLED: { label: 'Cancelled', color: 'error' as const },
  NO_SHOW: { label: 'No show', color: 'neutral' as const },
} as const

// ── Data fetching ─────────────────────────────────────────────────────────────

const { data: stats, status: statsStatus } = await useFetch<Stats>('/api/admin/stats', { lazy: true })
const { data: shows } = await useFetch<Show[]>('/api/shows', { lazy: true })

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPounds(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

function formatDate(val: string | number | null | undefined): string {
  if (!val) return '—'
  const d = typeof val === 'number' ? new Date(val * 1000) : new Date(val)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

function statusCount(status: string): number {
  return stats.value?.reservationsByStatus?.find(r => r.status === status)?.count ?? 0
}

// ── Export ────────────────────────────────────────────────────────────────────

const exportShowId = ref<string>('')

const showOptions = computed(() => [
  { label: 'All shows', value: '' },
  ...(shows.value ?? []).map(s => ({ label: s.title, value: s.id })),
])

const exportUrl = computed(() => {
  const params = new URLSearchParams()
  if (exportShowId.value) params.set('showId', exportShowId.value)
  const qs = params.toString()
  return `/api/admin/export/tickets${qs ? `?${qs}` : ''}`
})

// ── Revenue by show table ─────────────────────────────────────────────────────

const revenueColumns: TableColumn<RevenueByShow>[] = [
  {
    accessorKey: 'showTitle',
    header: 'Show',
  },
  {
    accessorKey: 'totalTickets',
    header: 'Tickets Sold',
  },
  {
    accessorKey: 'totalRevenuePence',
    header: 'Revenue',
    cell: ({ row }) => formatPounds(row.original.totalRevenuePence),
  },
]

// ── Recent reservations table ─────────────────────────────────────────────────

const UBadge = resolveComponent('UBadge')

const recentColumns: TableColumn<RecentReservation>[] = [
  {
    accessorKey: 'bookingRef',
    header: 'Ref',
    cell: ({ row }) => h('span', { class: 'font-mono font-semibold text-sm' }, row.original.bookingRef),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const cfg = STATUS_CONFIG[row.original.status] ?? { label: row.original.status, color: 'neutral' as const }
      return h(UBadge, { color: cfg.color, variant: 'subtle', label: cfg.label })
    },
  },
  {
    accessorKey: 'user',
    header: 'Customer',
    cell: ({ row }) => row.original.user?.name ?? '—',
  },
  {
    id: 'show',
    header: 'Show',
    cell: ({ row }) => row.original.performance?.show?.title ?? '—',
  },
  {
    id: 'performance',
    header: 'Performance',
    cell: ({ row }) => formatDate(row.original.performance?.startsAt),
  },
  {
    accessorKey: 'createdAt',
    header: 'Reserved At',
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
]
</script>

<template>
  <div class="p-6 space-y-8">
    <!-- Loading state -->
    <div
      v-if="statsStatus === 'pending'"
      class="flex items-center justify-center py-20"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-8 animate-spin text-primary"
      />
    </div>

    <template v-else-if="stats">
      <!-- ── Stat cards ─────────────────────────────────────────────────── -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Total Revenue -->
        <UCard class="hover:ring-1 hover:ring-primary transition-shadow">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm text-muted truncate">
                Total Revenue
              </p>
              <p class="mt-1 text-2xl font-bold tracking-tight text-highlighted truncate">
                {{ formatPounds(stats.totalRevenuePence) }}
              </p>
              <p class="mt-1 text-xs text-muted">
                Collected &amp; door only
              </p>
            </div>
            <div class="shrink-0 rounded-lg bg-success/10 p-2">
              <UIcon
                name="i-lucide-pound-sterling"
                class="size-5 text-success"
              />
            </div>
          </div>
        </UCard>

        <!-- Tickets Sold -->
        <UCard class="hover:ring-1 hover:ring-primary transition-shadow">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm text-muted truncate">
                Tickets Sold
              </p>
              <p class="mt-1 text-2xl font-bold tracking-tight text-highlighted">
                {{ stats.totalTicketsSold.toLocaleString('en-GB') }}
              </p>
              <p class="mt-1 text-xs text-muted">
                Collected &amp; door only
              </p>
            </div>
            <div class="shrink-0 rounded-lg bg-primary/10 p-2">
              <UIcon
                name="i-lucide-ticket"
                class="size-5 text-primary"
              />
            </div>
          </div>
        </UCard>

        <!-- Active Shows -->
        <UCard class="hover:ring-1 hover:ring-primary transition-shadow">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm text-muted truncate">
                Published Shows
              </p>
              <p class="mt-1 text-2xl font-bold tracking-tight text-highlighted">
                {{ stats.activeShows }}
              </p>
              <p class="mt-1 text-xs text-muted">
                Currently live
              </p>
            </div>
            <div class="shrink-0 rounded-lg bg-info/10 p-2">
              <UIcon
                name="i-lucide-clapperboard"
                class="size-5 text-info"
              />
            </div>
          </div>
        </UCard>

        <!-- Upcoming Performances -->
        <UCard class="hover:ring-1 hover:ring-primary transition-shadow">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm text-muted truncate">
                Upcoming Performances
              </p>
              <p class="mt-1 text-2xl font-bold tracking-tight text-highlighted">
                {{ stats.upcomingPerformances }}
              </p>
              <p class="mt-1 text-xs text-muted">
                On sale, yet to start
              </p>
            </div>
            <div class="shrink-0 rounded-lg bg-warning/10 p-2">
              <UIcon
                name="i-lucide-calendar-clock"
                class="size-5 text-warning"
              />
            </div>
          </div>
        </UCard>
      </div>

      <!-- ── Reservation status breakdown ──────────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-bookmark-check"
              class="size-4 text-muted"
            />
            <span class="font-semibold">Reservations by Status</span>
          </div>
        </template>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <div
            v-for="(cfg, key) in STATUS_CONFIG"
            :key="key"
            class="flex flex-col items-center rounded-xl border border-default bg-elevated/50 p-4 gap-1"
          >
            <span class="text-2xl font-bold text-highlighted">{{ statusCount(key) }}</span>
            <UBadge
              :color="cfg.color"
              variant="subtle"
              :label="cfg.label"
            />
          </div>
        </div>
      </UCard>

      <!-- ── Revenue by show ────────────────────────────────────────────── -->
      <UCard v-if="stats.revenueByShow.length > 0">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-bar-chart-2"
                class="size-4 text-muted"
              />
              <span class="font-semibold">Revenue by Show</span>
            </div>
            <UBadge
              color="neutral"
              variant="subtle"
              :label="`${stats.revenueByShow.length} shows`"
            />
          </div>
        </template>

        <!-- Revenue bar chart (manual) -->
        <div class="space-y-3 mb-4">
          <div
            v-for="show in stats.revenueByShow"
            :key="show.showId"
            class="space-y-1"
          >
            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <span class="truncate font-medium">{{ show.showTitle }}</span>
                <UBadge
                  :color="show.showStatus === 'PUBLISHED' ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  :label="show.showStatus === 'PUBLISHED' ? 'Live' : 'Draft'"
                />
              </div>
              <div class="shrink-0 flex items-center gap-3 text-right">
                <span class="text-muted text-xs">{{ show.totalTickets }} tickets</span>
                <span class="font-semibold text-highlighted">{{ formatPounds(show.totalRevenuePence) }}</span>
              </div>
            </div>
            <div class="h-2 w-full rounded-full bg-elevated overflow-hidden">
              <div
                class="h-full rounded-full bg-primary transition-all duration-500"
                :style="{
                  width: stats.totalRevenuePence > 0
                    ? `${Math.round((show.totalRevenuePence / stats.totalRevenuePence) * 100)}%`
                    : '0%',
                }"
              />
            </div>
          </div>
        </div>

        <UTable
          :data="stats.revenueByShow"
          :columns="revenueColumns"
          class="mt-2"
        />
      </UCard>

      <!-- ── Recent reservations ────────────────────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-clock"
                class="size-4 text-muted"
              />
              <span class="font-semibold">Recent Reservations</span>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-external-link"
              label="View all"
              to="/admin/reservations"
            />
          </div>
        </template>

        <UTable
          :data="stats.recentReservations"
          :columns="recentColumns"
        />
      </UCard>

      <!-- ── Quick actions ───────────────────────────────────────────────── -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-calendar"
          label="Manage Shows"
          to="/admin/shows"
          class="justify-center"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-bookmark-check"
          label="Reservations"
          to="/admin/reservations"
          class="justify-center"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-users"
          label="Users"
          to="/admin/users"
          class="justify-center"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-building"
          label="Venues"
          to="/admin/venues"
          class="justify-center"
        />
      </div>
    </template>

    <!-- ── Treasurer Export ────────────────────────────────────────────── -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-download"
            class="size-4 text-muted"
          />
          <span class="font-semibold">Export Ticket Data</span>
          <UBadge
            color="warning"
            variant="subtle"
            label="Treasurer"
            size="sm"
          />
        </div>
      </template>

      <p class="text-sm text-muted mb-4">
        Download a CSV file of ticket and reservation data for financial reporting.
        The export includes all statuses (pending, collected, door, cancelled, and no-show)
        so you have a full audit trail. Refunded tickets are marked with a "Refunded" column.
      </p>

      <div class="flex flex-col sm:flex-row items-start sm:items-end gap-3">
        <UFormField
          label="Filter by show"
          class="flex-1 min-w-48"
        >
          <USelect
            v-model="exportShowId"
            :options="showOptions"
            value-attribute="value"
            option-attribute="label"
            placeholder="All shows"
            class="w-full"
          />
        </UFormField>

        <UButton
          color="success"
          icon="i-lucide-download"
          label="Download CSV"
          :to="exportUrl"
          external
          download
        />
      </div>

      <USeparator class="my-4" />

      <p class="text-xs text-muted">
        <UIcon
          name="i-lucide-info"
          class="size-3 inline"
        />
        Columns included: Booking Ref, Status, Refunded, Customer Name, Customer Email, Show, Performance Date, Performance Time, Venue, Ticket Type, Price Paid (£), Booked At, Customer Notes, Staff Notes
      </p>
    </UCard>
  </div>
</template>

<style></style>
