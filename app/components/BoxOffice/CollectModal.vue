<!--
  Box Office: Collect Reservation Slideover

  FoH workflow for collecting a customer's reservation at the box office.
  Combines ticket management and status update into one step.

  Flow:
  1. Staff clicks "Collect" on the reservations list
  2. Slideover opens — shows customer, booking ref, ticket breakdown
  3. Staff adjusts ticket quantities if needed
  4. Staff confirms total, presses "Collect" to finalise
  5. Optionally mark as No-Show (with confirmation)

  Data:
  - GET /api/reservations/:id → current tickets + customer
  - GET /api/reservations/:id/available-ticket-types → addable types + effective prices

  Mutations:
  - PUT /api/reservations/:id/tickets → save ticket changes
  - PUT /api/reservations/:id → update status
-->
<script setup lang="ts">
// ── Types ──────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string
  ticketTypeId: string
  pricePaid: number
  refundedAt: string | null
  ticketType: { id: string, name: string, description: string | null }
}

interface ReservationDetail {
  id: string
  bookingRef: string
  status: 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW'
  customerNotes?: string | null
  staffNotes?: string | null
  performanceId: string
  tickets: Ticket[]
  user: { id: string, name: string, email: string }
  performance: {
    startsAt: string | number
    durationMinutes?: number | null
    intervalCount: number
    intervalMinutes?: number | null
    show: { title: string }
    venue: { name: string }
  }
}

interface AvailableType {
  id: string
  name: string
  description: string | null
  effectivePrice: number
  active: boolean
}

// ── Props / emits ─────────────────────────────────────────────────────────────

const props = defineProps<{
  reservationId: string | null
  bookingRef: string | null
}>()

const emit = defineEmits<{
  refresh: []
  close: []
}>()

const open = computed({
  get: () => !!props.reservationId,
  set: (value: boolean) => { if (!value) emit('close') },
})

// ── Data ──────────────────────────────────────────────────────────────────────

const reservation = ref<ReservationDetail | null>(null)
const availableTypes = ref<AvailableType[]>([])
const loading = ref(false)
const collecting = ref(false)
const markingNoShow = ref(false)
const toast = useToast()
const confirm = useConfirm()

// ── Edit state ────────────────────────────────────────────────────────────────

const editState = ref(new Map<string, number>())
const originalState = ref(new Map<string, number>())

function initEditState(ticketList: Ticket[]) {
  const state = new Map<string, number>()
  for (const t of ticketList.filter(t => !t.refundedAt)) {
    state.set(t.ticketTypeId, (state.get(t.ticketTypeId) ?? 0) + 1)
  }
  editState.value = new Map(state)
  originalState.value = new Map(state)
}

function getQty(typeId: string): number {
  return editState.value.get(typeId) ?? 0
}

function setQty(typeId: string, value: number) {
  const next = new Map(editState.value)
  next.set(typeId, Math.max(0, value))
  editState.value = next
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadData() {
  if (!props.reservationId) return
  loading.value = true
  try {
    const [res, types] = await Promise.all([
      $fetch<ReservationDetail>(`/api/reservations/${props.reservationId}`),
      $fetch<AvailableType[]>(`/api/reservations/${props.reservationId}/available-ticket-types`),
    ])
    reservation.value = res
    availableTypes.value = types
    initEditState(res.tickets)
  }
  catch (error: unknown) {
    toast.add({
      title: 'Failed to load reservation',
      description: getErrorMessage(error, 'Could not load ticket data'),
      color: 'error',
      icon: 'i-lucide-x-circle',
    })
  }
  finally {
    loading.value = false
  }
}

watch(() => props.reservationId, (id) => {
  if (id) {
    showAllTypes.value = false
    loadData()
  }
  else {
    reservation.value = null
    editState.value = new Map()
    originalState.value = new Map()
  }
}, { immediate: true })

// ── Ticket display rows ───────────────────────────────────────────────────────

const showAllTypes = ref(false)

const activeTickets = computed(() =>
  (reservation.value?.tickets ?? []).filter(t => !t.refundedAt),
)

const refundedTickets = computed(() =>
  (reservation.value?.tickets ?? []).filter(t => t.refundedAt),
)

const refundedCountByType = computed(() => {
  const map = new Map<string, number>()
  for (const t of refundedTickets.value) {
    map.set(t.ticketTypeId, (map.get(t.ticketTypeId) ?? 0) + 1)
  }
  return map
})

const displayRows = computed(() => {
  if (!reservation.value) return []

  const rows = new Map<string, { id: string, name: string, effectivePrice: number, isDefault: boolean }>()

  // Active tickets
  for (const t of activeTickets.value) {
    if (!rows.has(t.ticketTypeId)) {
      rows.set(t.ticketTypeId, {
        id: t.ticketTypeId,
        name: t.ticketType.name,
        // Existing tickets keep the price the customer booked at, not the
        // current price — the customer holds an email quoting the old price.
        effectivePrice: t.pricePaid,
        isDefault: true, // types with existing tickets always show
      })
    }
  }

  // Available types not already in the map
  for (const avail of availableTypes.value) {
    if (!rows.has(avail.id)) {
      rows.set(avail.id, {
        id: avail.id,
        name: avail.name,
        effectivePrice: avail.effectivePrice,
        isDefault: avail.active,
      })
    }
  }

  // Refunded types not already in the map
  for (const t of refundedTickets.value) {
    if (!rows.has(t.ticketTypeId)) {
      rows.set(t.ticketTypeId, {
        id: t.ticketTypeId,
        name: t.ticketType.name,
        effectivePrice: t.pricePaid,
        isDefault: true, // refunded types always show
      })
    }
  }

  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name))
})

const primaryRows = computed(() =>
  displayRows.value.filter(row => row.isDefault),
)

const additionalRows = computed(() =>
  displayRows.value.filter(row => !row.isDefault),
)

const visibleRows = computed(() =>
  showAllTypes.value ? displayRows.value : primaryRows.value,
)

// ── Totals ────────────────────────────────────────────────────────────────────

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

const totalCount = computed(() => {
  let n = 0
  for (const qty of editState.value.values()) n += qty
  return n
})

// Subtotal for a type: existing tickets kept are charged at the price they were
// booked at (pricePaid); tickets newly added at the door are charged at the
// current effective price.
function rowSubtotal(typeId: string): number {
  const desired = getQty(typeId)
  const existing = activeTickets.value.filter(t => t.ticketTypeId === typeId)
  const kept = Math.min(desired, existing.length)
  const added = Math.max(0, desired - existing.length)

  let sub = 0
  for (let i = 0; i < kept; i++) sub += existing[i]!.pricePaid
  const currentPrice = availableTypes.value.find(a => a.id === typeId)?.effectivePrice ?? 0
  sub += added * currentPrice
  return sub
}

const totalPrice = computed(() => {
  let total = 0
  for (const row of displayRows.value) {
    total += rowSubtotal(row.id)
  }
  return total
})

const isDirty = computed(() => {
  for (const [typeId, desired] of editState.value) {
    if ((originalState.value.get(typeId) ?? 0) !== desired) return true
  }
  for (const [typeId, original] of originalState.value) {
    if ((editState.value.get(typeId) ?? 0) !== original) return true
  }
  return false
})

const alreadyActioned = computed(() =>
  !!reservation.value && ['COLLECTED', 'CANCELLED', 'NO_SHOW'].includes(reservation.value.status),
)

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(val: string | number): string {
  const d = new Date(typeof val === 'number' ? val * 1000 : val)
  return Number.isNaN(d.getTime())
    ? ''
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

// ── Actions ───────────────────────────────────────────────────────────────────

async function saveTicketsIfDirty(): Promise<boolean> {
  if (!isDirty.value || !props.reservationId) return true

  const ticketPayload = Array.from(editState.value.entries())
    .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))

  await $fetch(`/api/reservations/${props.reservationId}/tickets`, {
    method: 'PUT',
    body: { tickets: ticketPayload },
  })
  return true
}

async function collect() {
  if (!props.reservationId) return
  collecting.value = true
  try {
    await saveTicketsIfDirty()
    await $fetch(`/api/reservations/${props.reservationId}`, {
      method: 'PUT',
      body: { status: 'COLLECTED' },
    })
    toast.add({
      title: 'Tickets collected',
      description: `Booking ${props.bookingRef} marked as collected`,
      icon: 'i-lucide-check-circle',
      color: 'success',
    })
    emit('refresh')
    emit('close')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to collect reservation'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    collecting.value = false
  }
}

async function markNoShow() {
  const ok = await confirm({
    title: 'Mark as no-show?',
    description: `Mark booking ${props.bookingRef} as a no-show? The customer did not collect their tickets.`,
    confirmLabel: 'Mark no-show',
    confirmColor: 'warning',
    cancelLabel: 'Cancel',
  })
  if (!ok || !props.reservationId) return

  markingNoShow.value = true
  try {
    await $fetch(`/api/reservations/${props.reservationId}`, {
      method: 'PUT',
      body: { status: 'NO_SHOW' },
    })
    toast.add({
      title: 'Marked as no-show',
      description: `Booking ${props.bookingRef} recorded as no-show`,
      icon: 'i-lucide-user-x',
      color: 'warning',
    })
    emit('refresh')
    emit('close')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update reservation'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    markingNoShow.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="`Collect — ${bookingRef ?? ''}`"
    side="right"
  >
    <template #description>
      <span
        v-if="reservation"
        class="text-muted text-sm"
      >
        {{ reservation.user.name }} ·
        {{ reservation.performance.show.title }} ·
        {{ reservation.performance.venue.name }} ·
        {{ formatDate(reservation.performance.startsAt) }}
      </span>
    </template>

    <template #body>
      <!-- Loading skeleton -->
      <div
        v-if="loading"
        class="space-y-3"
      >
        <USkeleton
          v-for="i in 4"
          :key="i"
          class="h-12 w-full"
        />
      </div>

      <template v-else-if="reservation">
        <!-- Already actioned banner -->
        <UAlert
          v-if="alreadyActioned"
          :title="`This reservation is already ${reservation.status.toLowerCase().replace('_', '-')}`"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          class="mb-4"
        />

        <!-- Customer notes -->
        <div
          v-if="reservation.customerNotes"
          class="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5"
        >
          <p class="text-xs font-medium text-warning mb-0.5 inline-flex items-center gap-1.5">
            <UIcon
              name="i-lucide-message-circle-warning"
              class="size-3.5"
            />
            Customer notes
          </p>
          <p class="text-sm text-default">
            {{ reservation.customerNotes }}
          </p>
        </div>

        <!-- Ticket rows -->
        <div class="space-y-1.5">
          <div
            v-for="row in visibleRows"
            :key="row.id"
            class="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-default"
          >
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium leading-tight text-highlighted">
                {{ row.name }}
              </p>
              <p class="text-xs text-muted">
                {{ formatPrice(row.effectivePrice) }} each
                <template v-if="(refundedCountByType.get(row.id) ?? 0) > 0">
                  ·
                  <span class="text-warning">
                    {{ refundedCountByType.get(row.id) }} refunded
                  </span>
                </template>
              </p>
            </div>

            <!-- Stepper -->
            <div class="flex items-center gap-1 shrink-0">
              <UButton
                icon="i-lucide-minus"
                color="neutral"
                variant="outline"
                size="xs"
                :disabled="alreadyActioned || getQty(row.id) === 0"
                @click="setQty(row.id, getQty(row.id) - 1)"
              />
              <span class="w-7 text-center text-sm font-medium tabular-nums">
                {{ getQty(row.id) }}
              </span>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                size="xs"
                :disabled="alreadyActioned"
                @click="setQty(row.id, getQty(row.id) + 1)"
              />
            </div>

            <!-- Row subtotal -->
            <div class="w-16 text-right text-sm tabular-nums shrink-0">
              <span :class="getQty(row.id) > 0 ? 'text-highlighted font-medium' : 'text-muted'">
                {{ formatPrice(rowSubtotal(row.id)) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Show all toggle -->
        <UButton
          v-if="additionalRows.length > 0"
          :label="showAllTypes ? 'Show fewer ticket types' : `Show all ticket types (${additionalRows.length} more)`"
          :icon="showAllTypes ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          color="neutral"
          variant="ghost"
          size="xs"
          block
          class="mt-2"
          @click="showAllTypes = !showAllTypes"
        />

        <!-- Unsaved-change hint -->
        <p
          v-if="isDirty"
          class="text-xs text-warning inline-flex items-center gap-1.5 mt-2"
        >
          <UIcon
            name="i-lucide-circle-dot"
            class="size-3"
          />
          Ticket quantities modified — will be saved on collect
        </p>

        <!-- Total summary -->
        <div class="border-t border-default pt-4 mt-4">
          <div class="flex justify-between items-baseline">
            <span class="text-sm text-muted">
              {{ totalCount }} {{ totalCount === 1 ? 'ticket' : 'tickets' }}
            </span>
            <span class="text-2xl font-semibold text-highlighted tabular-nums">
              {{ formatPrice(totalPrice) }}
            </span>
          </div>
          <div
            v-if="refundedTickets.length > 0"
            class="flex justify-between text-xs text-muted mt-1"
          >
            <span>
              {{ refundedTickets.length }}
              ticket{{ refundedTickets.length === 1 ? '' : 's' }} refunded
            </span>
          </div>
        </div>
      </template>
    </template>

    <template #footer>
      <div class="flex justify-between gap-2 w-full">
        <!-- Left: secondary actions -->
        <UButton
          label="No-Show"
          color="neutral"
          variant="subtle"
          icon="i-lucide-user-x"
          :loading="markingNoShow"
          :disabled="alreadyActioned || collecting"
          @click="markNoShow"
        />

        <!-- Right: primary + dismiss -->
        <div class="flex gap-2">
          <UButton
            label="Close"
            color="neutral"
            variant="ghost"
            :disabled="collecting || markingNoShow"
            @click="emit('close')"
          />
          <UButton
            icon="i-lucide-check"
            :label="alreadyActioned
              ? `Already ${reservation?.status?.toLowerCase().replace('_', '-')}`
              : 'Collect'"
            color="success"
            :loading="collecting"
            :disabled="alreadyActioned || markingNoShow || totalCount === 0"
            @click="collect"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
