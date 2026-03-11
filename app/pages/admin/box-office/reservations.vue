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
  - GET /api/reservations?performanceId=:id → reservations table
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

function toDate(val: string | number | null | undefined): Date | null {
  if (!val) return null
  const d = new Date(typeof val === 'number' ? val * 1000 : val)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatTime(val: string | number | null | undefined): string {
  const d = toDate(val)
  if (!d) return '—'
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDateTime(val: string | number | null | undefined): string {
  const d = toDate(val)
  if (!d) return '—'
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

// ── Shows data ────────────────────────────────────────────────────────────────

const { data: shows, status: showsStatus } = await useFetch<Show[]>('/api/shows', {
  key: 'box-office-shows',
})

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

const { data: reservations, status: reservationsStatus, refresh } = await useAsyncData(
  'box-office-reservations',
  () => {
    if (!selectedPerformanceId.value) return Promise.resolve([] as Reservation[])
    return $fetch<Reservation[]>('/api/reservations', {
      query: { performanceId: selectedPerformanceId.value },
    })
  },
  {
    default: () => [] as Reservation[],
    watch: [selectedPerformanceId],
  },
)

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

function openCollect(r: Reservation) {
  collectReservationId.value = r.id
  collectBookingRef.value = r.bookingRef
}

function closeCollect() {
  collectReservationId.value = null
  collectBookingRef.value = null
}

// ── Walk-in modal ─────────────────────────────────────────────────────────────

const walkInOpen = ref(false)

const performanceLabel = computed(() => {
  const p = selectedPerformance.value
  if (!p) return ''
  return `${p.showTitle} — ${formatTime(p.startsAt)}`
})

async function onWalkInCreated(reservationId: string, bookingRef: string) {
  await refresh()
  // Immediately open collect so staff can process the walk-in in one flow
  collectReservationId.value = reservationId
  collectBookingRef.value = bookingRef
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
              h('p', { class: 'text-sm text-default whitespace-pre-wrap' }, row.original.customerNotes),
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
              h('p', { class: 'text-sm text-default whitespace-pre-wrap' }, row.original.staffNotes),
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
        <h1 class="text-2xl font-semibold tracking-tight">
          Box Office
        </h1>
        <p class="text-muted text-sm">
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
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="reservationsStatus === 'pending'"
          @click="refresh()"
        />
      </div>
    </div>

    <!-- Performance navigator -->
    <div class="rounded-xl border border-default bg-elevated/60 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!prevPerformance"
          :tooltip="prevPerformance
            ? `${prevPerformance.showTitle} — ${formatDateTime(prevPerformance.startsAt)}`
            : undefined"
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
          :tooltip="nextPerformance
            ? `${nextPerformance.showTitle} — ${formatDateTime(nextPerformance.startsAt)}`
            : undefined"
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
        <span
          v-if="sortedPerformances.length > 1"
          class="ml-auto text-xs tabular-nums opacity-50"
        >
          {{ currentIndex + 1 }} / {{ sortedPerformances.length }}
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
        :ui="{
          base: 'table-fixed border-separate border-spacing-0',
          thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
          tbody: '[&>tr]:last:[&>td]:border-b-0',
          th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
          td: 'border-b border-default',
        }"
      />

      <!-- Empty state -->
      <div
        v-if="filteredReservations.length === 0 && reservationsStatus !== 'pending'"
        class="text-center py-12 text-muted"
      >
        <UIcon
          name="i-lucide-ticket"
          class="size-10 mb-3 opacity-30 mx-auto"
        />
        <p class="text-sm">
          {{ searchQuery || statusFilter !== 'ALL' ? 'No reservations match your filter.' : 'No reservations for this performance.' }}
        </p>
      </div>

      <!-- Footer count -->
      <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto text-sm text-muted">
        <span>
          {{ filteredReservations.length }}
          reservation{{ filteredReservations.length === 1 ? '' : 's' }} shown
          <template v-if="reservations && reservations.length !== filteredReservations.length">
            of {{ reservations.length }} total
          </template>
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
  </div>
</template>
