<!--
  Box Office: FoH Reservations

  Front-of-house reservation management for Box Office Staff.

  Features:
  - Performance navigator: prev/next arrows cycle through all shows chronologically
  - Defaults to today's performance; shows banner when no show today
  - "Collect" slideover: confirms tickets + marks COLLECTED
  - "Walk-in" modal: creates on-the-door reservation then immediately collects
  - Status summary pills (Pending, Collected, Door, No-Show, Cancelled)
  - Search by booking ref or customer name/email
  - "Mark all as No-Show" per performance (fun toast if show hasn't started)

  Data:
  - GET /api/shows  → build performance navigator
  - GET /api/reservations?performanceId=:id&withCounts=true → reservations table
-->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UPopover = resolveComponent('UPopover')

definePageMeta({
  layout: 'admin',
  middleware: ['staff'],
  title: 'Box Office',
})

const toast = useToast()
const confirm = useConfirm()

// ── Types ─────────────────────────────────────────────────────────────────────

interface Performance {
  id: string
  showId: string
  startsAt: string | number
  doorsAt?: string | number | null
  durationMinutes?: number | null
  capacityOverride?: number | null
  ticketsSold?: number
  intervalCount: number
  intervalMinutes?: number | null
  status: string
  venue: { id: string, name: string, capacity?: number | null }
}

interface Show {
  id: string
  title: string
  performances: Performance[]
}

interface Reservation {
  id: string
  bookingRef: string
  performanceId: string
  ticketCount?: number
  status: 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW'
  cancelledBy?: 'CUSTOMER' | 'STAFF' | null
  customerNotes?: string | null
  staffNotes?: string | null
  createdAt: string
  user: { id: string, name: string, email: string }
  performance: {
    id: string
    startsAt: string | number
    durationMinutes?: number | null
    intervalCount: number
    intervalMinutes?: number | null
    status: string
    show: { id: string, title: string }
    venue: { id: string, name: string }
  }
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'warning' as const, icon: 'i-lucide-clock' },
  COLLECTED: { label: 'Collected', color: 'success' as const, icon: 'i-lucide-check-circle' },
  DOOR: { label: 'Door', color: 'info' as const, icon: 'i-lucide-door-open' },
  CANCELLED: { label: 'Cancelled', color: 'error' as const, icon: 'i-lucide-x-circle' },
  NO_SHOW: { label: 'No-show', color: 'neutral' as const, icon: 'i-lucide-user-x' },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────
// `toDate` and `formatTime` come from app/utils/format.ts — every page had its
// own copy of both, and an omitted timeZone is an hour wrong all summer.

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

// ── Shows data ────────────────────────────────────────────────────────────────

// requestFetch, not a plain useFetch: `/api/shows` is behind authorize(), and a
// plain useFetch running on the server does not forward the session cookie — the
// performance picker came back 403 and empty on every hard load, filling in only
// once something triggered a client-side refetch. Same rule for the reservation
// pages fetched below. See docs/02-architecture.md §Fetching in the admin area.
const requestFetch = useRequestFetch()
const { data: shows, status: showsStatus, error: showsError, refresh: refreshShows } = await useAsyncData(
  'box-office-shows', () => requestFetch<Show[]>('/api/shows'))

// Flatten all performances, sorted chronologically (past → future)
const sortedPerformances = computed(() => {
  if (!shows.value) return []
  return shows.value
    .flatMap(show => show.performances.map(perf => ({ ...perf, showTitle: show.title })))
    .filter(p => p.status !== 'CANCELLED')
    .sort((a, b) => (toDate(a.startsAt)?.getTime() ?? 0) - (toDate(b.startsAt)?.getTime() ?? 0))
})

// ── Performance navigation ────────────────────────────────────────────────────

function pickDefaultPerformance(perfs: typeof sortedPerformances.value): string | undefined {
  if (perfs.length === 0) return undefined
  const rightNow = new Date()
  const nowMs = rightNow.getTime()

  // Try today's first performance
  const todayPerf = perfs.find((p) => {
    const d = toDate(p.startsAt)
    return d ? isSameDay(d, rightNow) : false
  })
  if (todayPerf) return todayPerf.id

  // Nearest upcoming, or most recent past
  const upcoming = perfs.find(p => (toDate(p.startsAt)?.getTime() ?? 0) >= nowMs)
  return (upcoming ?? perfs[perfs.length - 1])?.id
}

// Set the default synchronously — available during SSR since shows are already resolved
const selectedPerformanceId = ref<string | undefined>(pickDefaultPerformance(sortedPerformances.value))

const currentIndex = computed(() =>
  sortedPerformances.value.findIndex(p => p.id === selectedPerformanceId.value),
)

const selectedPerformance = computed(() =>
  currentIndex.value >= 0 ? sortedPerformances.value[currentIndex.value] ?? null : null,
)

// Wrap-around navigation — always navigable when > 1 performance
const prevPerformance = computed(() => {
  const perfs = sortedPerformances.value
  if (perfs.length <= 1) return null
  return perfs[(currentIndex.value - 1 + perfs.length) % perfs.length]
})

const nextPerformance = computed(() => {
  const perfs = sortedPerformances.value
  if (perfs.length <= 1) return null
  return perfs[(currentIndex.value + 1) % perfs.length]
})

function goToPrev() {
  if (prevPerformance.value) {
    selectedPerformanceId.value = prevPerformance.value.id
  }
}

function goToNext() {
  if (nextPerformance.value) {
    selectedPerformanceId.value = nextPerformance.value.id
  }
}

const isToday = computed(() => {
  const d = selectedPerformance.value ? toDate(selectedPerformance.value.startsAt) : null
  return d ? isSameDay(d, new Date()) : false
})

const noPerformanceToday = computed(() => {
  if (showsStatus.value === 'pending') return false
  const rightNow = new Date()
  return !sortedPerformances.value.some((p) => {
    const d = toDate(p.startsAt)
    return d ? isSameDay(d, rightNow) : false
  })
})

// ── Reservations data ─────────────────────────────────────────────────────────

/**
 * The door list must be complete — a silently truncated one sends someone away
 * who has actually booked. `/api/reservations` is paginated and caps a page at
 * 100; the busiest performance on record has 94 reservations, so this is
 * normally a single request, but it follows pages until it has them all rather
 * than relying on that staying true.
 */
async function fetchAllForPerformance(performanceId: string): Promise<Reservation[]> {
  const limit = 100
  const rows: Reservation[] = []
  let page = 1
  let total = 0

  do {
    const res = await requestFetch<{ rows: Reservation[], total: number }>('/api/reservations', {
      query: { performanceId, withCounts: 'true', page, limit },
    })
    rows.push(...res.rows)
    total = res.total
    page++
  } while (rows.length < total && rows.length > 0)

  return rows
}

const { data: reservations, status: reservationsStatus, refresh: refreshReservations } = await useAsyncData(
  'box-office-reservations',
  () => {
    if (!selectedPerformanceId.value) return Promise.resolve([] as Reservation[])
    return fetchAllForPerformance(selectedPerformanceId.value)
  },
  {
    default: () => [] as Reservation[],
    watch: [selectedPerformanceId],
  },
)

// Refresh both reservations and the shows data — the capacity pill's
// ticketsSold comes from /api/shows, so it must be re-fetched after a walk-in
// or collection, not just the reservation list.
async function refresh() {
  await Promise.all([refreshReservations(), refreshShows()])
}

// ── Status filter + search ────────────────────────────────────────────────────

const searchQuery = ref('')
const statusFilter = ref<string>('ALL')

const filteredReservations = computed(() => {
  let rows = reservations.value ?? []

  if (statusFilter.value !== 'ALL') {
    rows = rows.filter(r => r.status === statusFilter.value)
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter(r =>
      r.bookingRef.toLowerCase().includes(q)
      || r.user.name.toLowerCase().includes(q)
      || r.user.email.toLowerCase().includes(q),
    )
  }

  return rows
})

// ── Status counts ─────────────────────────────────────────────────────────────

const statusCounts = computed(() => {
  const all = reservations.value ?? []
  return Object.fromEntries(
    Object.keys(STATUS_CONFIG).map(s => [s, all.filter(r => r.status === s).length]),
  ) as Record<string, number>
})

const pendingCount = computed(() => statusCounts.value.PENDING ?? 0)

const performanceCapacity = computed(() => {
  const p = selectedPerformance.value
  if (!p) return null
  return p.capacityOverride ?? p.venue.capacity ?? null
})

const ticketsSold = computed(() => selectedPerformance.value?.ticketsSold ?? 0)

const ticketsRemaining = computed(() => {
  const capacity = performanceCapacity.value
  if (capacity === null || capacity === undefined) return null
  return Math.max(0, capacity - ticketsSold.value)
})

const ticketsSoldPercent = computed(() => {
  const capacity = performanceCapacity.value
  if (!capacity || capacity <= 0) return null
  return Math.min(100, Math.max(0, Math.round((ticketsSold.value / capacity) * 100)))
})

// ── Reactive clock (ticks every 30s for show-started check) ──────────────────

const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 30_000)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})

const showHasStarted = computed(() => {
  const start = selectedPerformance.value ? toDate(selectedPerformance.value.startsAt) : null
  return start ? now.value >= start : false
})

// ── No-Show All ───────────────────────────────────────────────────────────────

const isMarkingAllNoShow = ref(false)

const funEarlyMessages = [
  'The curtain hasn\'t gone up yet — give them a chance!',
  'Shh, the show hasn\'t started! No no-shows before curtain up.',
  'Too early! The cast are still in their dressing rooms.',
  'Hold your horses — the show starts at {{ time }}.',
  'Even the latecomers aren\'t late yet.',
]

async function markAllNoShow() {
  const pending = (reservations.value ?? []).filter(r => r.status === 'PENDING')
  if (pending.length === 0) return

  // Fun toast if show hasn't started yet
  if (!showHasStarted.value) {
    const time = selectedPerformance.value
      ? formatTime(selectedPerformance.value.startsAt)
      : ''
    const pool = funEarlyMessages.map(m => m.replace('{{ time }}', time))
    const msg = pool[Math.floor(Math.random() * pool.length)]!
    toast.add({
      title: 'Show hasn\'t started',
      description: msg,
      color: 'info',
      icon: 'i-lucide-theater',
    })
    return
  }

  const ok = await confirm({
    title: `Mark ${pending.length} reservation${pending.length === 1 ? '' : 's'} as no-show?`,
    description: `This will mark all ${pending.length} pending reservation${pending.length === 1 ? '' : 's'} for this performance as no-show. This cannot be undone in bulk.`,
    confirmLabel: `Mark ${pending.length} as no-show`,
    confirmColor: 'warning',
    cancelLabel: 'Cancel',
  })
  if (!ok) return

  isMarkingAllNoShow.value = true
  try {
    await Promise.all(
      pending.map(r =>
        $fetch(`/api/reservations/${r.id}`, {
          method: 'PUT',
          body: { status: 'NO_SHOW' },
        }),
      ),
    )
    toast.add({
      title: 'No-show recorded',
      description: `${pending.length} reservation${pending.length === 1 ? '' : 's'} marked as no-show`,
      icon: 'i-lucide-user-x',
      color: 'warning',
    })
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to mark some reservations as no-show'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
    await refresh()
  }
  finally {
    isMarkingAllNoShow.value = false
  }
}

// ── Collect slideover ─────────────────────────────────────────────────────────

const collectReservationId = ref<string | null>(null)
const collectBookingRef = ref<string | null>(null)
// A walk-in is a sale made at the door, so it collects as DOOR rather than
// COLLECTED — this keeps on-the-door and pre-booked revenue distinguishable.
const collectAsDoor = ref(false)

function openCollect(r: Reservation) {
  collectReservationId.value = r.id
  collectBookingRef.value = r.bookingRef
  collectAsDoor.value = false
}

function closeCollect() {
  collectReservationId.value = null
  collectBookingRef.value = null
}

// ── Walk-in modal ─────────────────────────────────────────────────────────────

const walkInOpen = ref(false)

// ── Passes ────────────────────────────────────────────────────────────────────
// Admitting a pass holder creates a £0 ticket, so it lands on the door list like
// any other sale — refresh to pick it up.
const passesOpen = ref(false)

const performanceLabel = computed(() => {
  const p = selectedPerformance.value
  if (!p) return ''
  return `${p.showTitle} — ${formatTime(p.startsAt)}`
})

async function onWalkInCreated(reservationId: string, bookingRef: string) {
  await refresh()
  // Immediately open collect so staff can process the walk-in in one flow,
  // recording it as an on-the-door (DOOR) sale.
  collectReservationId.value = reservationId
  collectBookingRef.value = bookingRef
  collectAsDoor.value = true
}

// ── Table columns ─────────────────────────────────────────────────────────────

const columns: TableColumn<Reservation>[] = [
  {
    accessorKey: 'bookingRef',
    header: 'Ref',
    cell: ({ row }) =>
      h('span', { class: 'font-mono font-semibold text-highlighted tracking-widest text-sm' },
        row.original.bookingRef),
  },
  {
    id: 'tickets',
    header: 'Tickets',
    cell: ({ row }) =>
      h('span', { class: 'tabular-nums text-sm text-highlighted font-medium' }, String(row.original.ticketCount ?? 0)),
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
    id: 'notes',
    header: 'Notes',
    cell: ({ row }) => {
      const hasCustomerNotes = !!row.original.customerNotes
      const hasStaffNotes = !!row.original.staffNotes

      if (!hasCustomerNotes && !hasStaffNotes) return null

      const badges = []

      // Customer notes badge with popover
      if (hasCustomerNotes) {
        badges.push(
          h(UPopover, {
            mode: 'hover',
            openDelay: 200,
          }, {
            default: () => h(UBadge, {
              label: 'Customer',
              color: 'warning',
              variant: 'soft',
              icon: 'i-lucide-message-circle-warning',
              class: 'cursor-help',
            }),
            content: () => h('div', { class: 'p-3 max-w-xs' }, [
              h('p', { class: 'text-xs font-semibold text-highlighted mb-1' }, 'Customer Notes'),
              h('p', { class: 'text-sm text-default whitespace-pre-wrap' }, row.original.customerNotes ?? ''),
            ]),
          }),
        )
      }

      // Staff notes badge with popover
      if (hasStaffNotes) {
        badges.push(
          h(UPopover, {
            mode: 'hover',
            openDelay: 200,
          }, {
            default: () => h(UBadge, {
              label: 'Staff',
              color: 'info',
              variant: 'soft',
              icon: 'i-lucide-clipboard-list',
              class: 'cursor-help',
            }),
            content: () => h('div', { class: 'p-3 max-w-xs' }, [
              h('p', { class: 'text-xs font-semibold text-highlighted mb-1' }, 'Staff Notes'),
              h('p', { class: 'text-sm text-default whitespace-pre-wrap' }, row.original.staffNotes ?? ''),
            ]),
          }),
        )
      }

      return h('div', { class: 'flex gap-1.5' }, badges)
    },
  },
  {
    id: 'collect',
    header: '',
    cell: ({ row }) => {
      const r = row.original
      const isCollectable = r.status === 'PENDING' || r.status === 'DOOR'

      return h('div', { class: 'flex justify-end' },
        h(UButton, {
          label: 'Collect',
          icon: 'i-lucide-check',
          color: isCollectable ? 'success' : 'neutral',
          variant: isCollectable ? 'solid' : 'ghost',
          size: 'sm',
          onClick: () => openCollect(r),
        }),
      )
    },
  },
]

// ── Today's date (formatted, computed to avoid SSR mismatch) ─────────────────

const todayFormatted = computed(() =>
  new Date().toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
)
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Top: fixed sections (header, navigator, alerts, filters) -->
    <div class="flex flex-col gap-4 p-6 pb-0 shrink-0">
      <!-- Header -->
      <div class="flex w-full items-center justify-between gap-3 flex-wrap">
        <div>
          <!-- The date, not the screen name: UDashboardNavbar already renders
               "Box Office" as the page's <h1>, and a second one on the same
               page is exactly what @nuxt/a11y flags. The date is the part a
               volunteer on the door actually needs at a glance. -->
          <p class="text-2xl font-semibold tracking-tight text-highlighted">
            {{ todayFormatted }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            label="Walk-in"
            icon="i-lucide-door-open"
            color="success"
            variant="subtle"
            :disabled="!selectedPerformanceId"
            @click="walkInOpen = true"
          />

          <UButton
            label="Passes"
            icon="i-lucide-credit-card"
            color="neutral"
            variant="subtle"
            :disabled="!selectedPerformanceId"
            @click="passesOpen = true"
          />

          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="reservationsStatus === 'pending'"
            @click="refresh()"
          />
        </div>
      </div>

      <AdminFetchError
        v-if="showsError"
        :error="showsError"
        title="Could not load the performance list"
        :on-retry="refreshShows"
      />

      <!-- Performance navigator -->
      <div class="rounded-xl border border-default bg-elevated/60 overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!prevPerformance"
            @click="goToPrev"
          />

          <!-- Centre label -->
          <div class="flex-1 text-center min-w-0">
            <div
              v-if="showsStatus === 'pending'"
              class="flex justify-center"
            >
              <USkeleton class="h-5 w-52" />
            </div>

            <div
              v-else-if="selectedPerformance"
              class="flex items-center justify-center gap-2 flex-wrap"
            >
              <span class="font-semibold text-highlighted truncate">
                {{ selectedPerformance.showTitle }}
              </span>
              <UBadge
                v-if="isToday"
                label="Today"
                color="success"
                variant="subtle"
                size="sm"
              />
              <span class="text-muted text-sm">
                {{
                  (toDate(selectedPerformance.startsAt) ?? new Date()).toLocaleDateString('en-GB', {
                    timeZone: 'Europe/London',
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })
                }}
              </span>
            </div>

            <span
              v-else
              class="text-muted text-sm"
            >
              No performance selected
            </span>
          </div>

          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!nextPerformance"
            @click="goToNext"
          />
        </div>

        <!-- Performance details -->
        <div
          v-if="selectedPerformance"
          class="flex items-center gap-4 px-4 py-2 border-t border-default text-sm text-muted flex-wrap"
        >
          <span class="inline-flex items-center gap-1.5">
            <UIcon
              name="i-lucide-building"
              class="size-3.5 shrink-0"
            />
            {{ selectedPerformance.venue.name }}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <UIcon
              name="i-lucide-clock"
              class="size-3.5 shrink-0"
            />
            Doors {{ formatTime(selectedPerformance.doorsAt) }}
            · Curtain
            <strong class="text-highlighted">{{ formatTime(selectedPerformance.startsAt) }}</strong>
            <template v-if="selectedPerformance.durationMinutes">
              · ~{{ selectedPerformance.durationMinutes }} min
            </template>
            <template v-if="selectedPerformance.intervalCount > 0">
              with {{ selectedPerformance.intervalCount }}
              interval<template v-if="selectedPerformance.intervalMinutes">
                ({{ selectedPerformance.intervalMinutes }} min)
              </template>
            </template>
          </span>
        </div>

        <!-- No performances at all -->
        <div
          v-else-if="showsStatus !== 'pending'"
          class="px-4 py-3 text-sm text-muted"
        >
          No performances found.
        </div>
      </div>

      <!-- No show today banner -->
      <UAlert
        v-if="noPerformanceToday && selectedPerformanceId"
        title="No performance today"
        description="No shows scheduled for today — showing the nearest available performance."
        color="neutral"
        variant="subtle"
        icon="i-lucide-calendar-x"
      />

      <template v-if="selectedPerformanceId">
        <!-- Status pills -->
        <div class="flex items-center gap-2 flex-wrap">
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

          <div class="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-default bg-elevated text-xs text-muted tabular-nums whitespace-nowrap">
            <UIcon
              name="i-lucide-ticket"
              class="size-3.5 text-primary"
            />
            <span class="font-medium text-highlighted">{{ ticketsRemaining ?? '—' }}</span>
            <span v-if="performanceCapacity !== null">left</span>
            <template v-if="performanceCapacity !== null">
              <span class="opacity-50">·</span>
              <span>{{ ticketsSold }} / {{ performanceCapacity }} sold</span>
            </template>
            <template v-if="ticketsSoldPercent !== null">
              <span class="opacity-50">·</span>
              <span>{{ ticketsSoldPercent }}%</span>
            </template>
          </div>
        </div>

        <!-- Search + No-Show All -->
        <div class="flex gap-3 flex-wrap pb-4">
          <UInput
            v-model="searchQuery"
            placeholder="Search by booking ref or customer…"
            icon="i-lucide-search"
            class="flex-1 min-w-48"
          />

          <UButton
            label="Mark all as no-show"
            icon="i-lucide-user-x"
            color="warning"
            variant="subtle"
            :disabled="pendingCount === 0"
            :loading="isMarkingAllNoShow"
            @click="markAllNoShow"
          />
        </div>
      </template>
    </div>
    <!-- End top fixed section -->

    <!-- Scrollable table area -->
    <div
      v-if="selectedPerformanceId"
      class="flex-1 min-h-0 overflow-y-auto px-6 pb-6 flex flex-col gap-4"
    >
      <!-- Reservations table -->
      <UTable
        :data="filteredReservations"
        :columns="columns"
        :loading="reservationsStatus === 'pending'"
      >
        <template #empty>
          <UEmpty
            icon="i-lucide-ticket"
            :title="searchQuery || statusFilter !== 'ALL' ? 'No reservations match your filter' : 'No reservations for this performance'"
            :description="searchQuery || statusFilter !== 'ALL' ? 'Try a different name, reference or status.' : 'Walk-ins can still be added from here.'"
          />
        </template>
      </UTable>

      <!-- Footer count -->
      <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto text-sm text-muted">
        <span>
          {{ filteredReservations.length }}
          reservation{{ filteredReservations.length === 1 ? '' : 's' }} shown
        </span>
        <span v-if="pendingCount > 0">
          <span class="text-warning font-medium">{{ pendingCount }}</span> still pending
        </span>
      </div>
    </div>

    <!-- Collect slideover -->
    <BoxOfficeCollectModal
      :reservation-id="collectReservationId"
      :booking-ref="collectBookingRef"
      :door="collectAsDoor"
      @close="closeCollect"
      @refresh="refresh()"
    />

    <!-- Walk-in modal -->
    <BoxOfficeWalkInModal
      v-model:open="walkInOpen"
      :performance-id="selectedPerformanceId"
      :performance-label="performanceLabel"
      @created="onWalkInCreated"
    />

    <!-- Passes: look a holder up and admit them, or sell a new pass -->
    <BoxOfficePassModal
      v-model:open="passesOpen"
      :performance-id="selectedPerformanceId"
      :performance-label="performanceLabel"
      @admitted="refresh()"
    />
  </div>
</template>
