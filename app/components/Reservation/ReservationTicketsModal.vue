/**
 * Reservation Ticket Management Slideover
 *
 * Allows admins and staff to view and modify the ticket composition of a
 * reservation — adding, increasing, or decreasing each ticket type.
 *
 * Features:
 * - Shows all active (non-refunded) tickets grouped by type with stepper controls
 * - Shows refunded tickets read-only, separately
 * - Loads available ticket types (active for the performance) for adding new types
 * - Dirty-state detection with confirmation before closing
 * - Submits desired quantities via PUT /api/reservations/:id/tickets
 *
 * Data loading:
 * - GET /api/reservations/:id          (current ticket composition)
 * - GET /api/reservations/:id/available-ticket-types  (addable types + prices)
 *
 * @props reservationId  - ID of the reservation to manage (null = closed)
 * @props bookingRef     - Human-readable ref shown in the title
 * @emits refresh        - After a successful save
 * @emits close          - When the slideover should close
 */
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
  performanceId: string
  tickets: Ticket[]
  performance: {
    startsAt: string | number
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
  set: (value) => { if (!value) attemptClose() },
})

// ── Data ──────────────────────────────────────────────────────────────────────

const reservation = ref<ReservationDetail | null>(null)
const availableTypes = ref<AvailableType[]>([])
const loading = ref(false)
const saving = ref(false)
const toast = useToast()
const confirm = useConfirm()

// ── Edit state (declared before loadData/watch to avoid TDZ) ──────────────────

// editState: Map<typeId, desiredQuantity>
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
  const clamped = Math.max(0, value)
  editState.value = new Map(editState.value).set(typeId, clamped)
}

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
  if (id) loadData()
  else {
    reservation.value = null
    editState.value.clear()
    originalState.value.clear()
  }
}, { immediate: true })

// ── Ticket grouping ───────────────────────────────────────────────────────────

const activeTickets = computed(() =>
  (reservation.value?.tickets ?? []).filter(t => !t.refundedAt),
)

const refundedTickets = computed(() =>
  (reservation.value?.tickets ?? []).filter(t => t.refundedAt),
)

// Refunded count per type: Map<typeId, count>
const refundedCountByType = computed(() => {
  const map = new Map<string, number>()
  for (const t of refundedTickets.value) {
    map.set(t.ticketTypeId, (map.get(t.ticketTypeId) ?? 0) + 1)
  }
  return map
})
// All rows to display: types on the reservation plus available types not yet added
const displayRows = computed(() => {
  if (!reservation.value) return []

  // Build a map of ticketTypeId → type info from active tickets
  const fromActive = new Map<string, { id: string, name: string, effectivePrice: number, fromAvailable: boolean }>()

  for (const t of activeTickets.value) {
    if (!fromActive.has(t.ticketTypeId)) {
      const avail = availableTypes.value.find(a => a.id === t.ticketTypeId)
      fromActive.set(t.ticketTypeId, {
        id: t.ticketTypeId,
        name: t.ticketType.name,
        // Existing tickets keep the price the customer booked at, not the
        // current price. New additions are priced at the current rate below.
        effectivePrice: t.pricePaid,
        fromAvailable: !!avail,
      })
    }
  }

  // Include available types not yet in the reservation
  for (const avail of availableTypes.value) {
    if (!fromActive.has(avail.id)) {
      fromActive.set(avail.id, {
        id: avail.id,
        name: avail.name,
        effectivePrice: avail.effectivePrice,
        fromAvailable: true,
      })
    }
  }

  // Also include refunded-only types so they show up
  for (const t of refundedTickets.value) {
    if (!fromActive.has(t.ticketTypeId)) {
      fromActive.set(t.ticketTypeId, {
        id: t.ticketTypeId,
        name: t.ticketType.name,
        effectivePrice: t.pricePaid,
        fromAvailable: false,
      })
    }
  }

  return Array.from(fromActive.values()).sort((a, b) => a.name.localeCompare(b.name))
})

const isDirty = computed(() => {
  for (const [typeId, desired] of editState.value) {
    if ((originalState.value.get(typeId) ?? 0) !== desired) return true
  }
  return false
})

// ── Totals ────────────────────────────────────────────────────────────────────

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

// Subtotal for a type: existing tickets kept keep their booked price
// (pricePaid); newly added tickets are charged at the current effective price.
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

const activeTotal = computed(() => {
  let total = 0
  for (const row of displayRows.value) {
    total += rowSubtotal(row.id)
  }
  return total
})

const activeTotalCount = computed(() => {
  let count = 0
  for (const [, qty] of editState.value) count += qty
  return count
})

const refundedTotal = computed(() => {
  let total = 0
  for (const t of refundedTickets.value) total += t.pricePaid
  return total
})

// ── Save ──────────────────────────────────────────────────────────────────────

async function save() {
  if (!props.reservationId) return
  saving.value = true

  // Build the changed-only payload (but send all to keep it simple and avoid drift)
  const ticketPayload = Array.from(editState.value.entries()).map(([ticketTypeId, quantity]) => ({
    ticketTypeId,
    quantity,
  }))

  try {
    await $fetch(`/api/reservations/${props.reservationId}/tickets`, {
      method: 'PUT',
      body: { tickets: ticketPayload },
    })
    toast.add({
      title: 'Tickets updated',
      description: `Booking ${props.bookingRef} tickets have been updated`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    emit('refresh')
    emit('close')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update tickets'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

// ── Close guard ───────────────────────────────────────────────────────────────

async function attemptClose() {
  if (!isDirty.value) {
    emit('close')
    return
  }
  const confirmed = await confirm({
    title: 'Discard changes?',
    description: 'You have unsaved ticket changes. Are you sure you want to close?',
    confirmLabel: 'Discard',
    confirmColor: 'error',
    cancelLabel: 'Keep editing',
  })
  if (confirmed) emit('close')
}

// ── Performance date formatter ─────────────────────────────────────────────────

function formatDate(val: string | number): string {
  const d = new Date(typeof val === 'number' ? val * 1000 : val)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="`Manage Tickets — ${bookingRef ?? ''}`"
    side="right"
  >
    <template #description>
      <span
        v-if="reservation"
        class="text-muted text-sm"
      >
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
        <!-- Ticket rows -->
        <div class="space-y-1">
          <div
            v-for="row in displayRows"
            :key="row.id"
            class="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-default"
          >
            <!-- Type name -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-highlighted leading-tight">
                {{ row.name }}
              </p>
              <p class="text-xs text-muted">
                {{ formatPrice(row.effectivePrice) }} each
                <template v-if="(refundedCountByType.get(row.id) ?? 0) > 0">
                  ·
                  <span class="text-warning">
                    {{ refundedCountByType.get(row.id) }}
                    {{ refundedCountByType.get(row.id) === 1 ? 'refund' : 'refunds' }}
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
                :disabled="getQty(row.id) === 0"
                @click="setQty(row.id, getQty(row.id) - 1)"
              />
              <span class="w-6 text-center text-sm font-medium tabular-nums">
                {{ getQty(row.id) }}
              </span>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                size="xs"
                @click="setQty(row.id, getQty(row.id) + 1)"
              />
            </div>

            <!-- Row subtotal -->
            <div class="w-16 text-right text-sm text-muted tabular-nums shrink-0">
              {{ formatPrice(rowSubtotal(row.id)) }}
            </div>
          </div>
        </div>

        <!-- Refunded-only types (types with 0 active but some refunded, already in displayRows above) -->
        <!-- Summaries -->
        <div class="border-t border-default pt-3 mt-3 space-y-1">
          <div class="flex justify-between text-sm">
            <span class="text-muted">{{ activeTotalCount }} active {{ activeTotalCount === 1 ? 'ticket' : 'tickets' }}</span>
            <span class="font-medium text-highlighted tabular-nums">{{ formatPrice(activeTotal) }}</span>
          </div>
          <div
            v-if="refundedTickets.length > 0"
            class="flex justify-between text-sm"
          >
            <span class="text-muted">{{ refundedTickets.length }} {{ refundedTickets.length === 1 ? 'ticket' : 'tickets' }} refunded</span>
            <span class="text-muted line-through tabular-nums">{{ formatPrice(refundedTotal) }}</span>
          </div>
        </div>

        <!-- Dirty state hint -->
        <p
          v-if="isDirty"
          class="text-xs text-warning flex items-center gap-1.5 mt-2"
        >
          <UIcon
            name="i-lucide-circle-dot"
            class="size-3"
          />
          Unsaved changes
        </p>
      </template>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Cancel"
          color="neutral"
          variant="subtle"
          @click="attemptClose"
        />
        <UButton
          label="Save changes"
          :loading="saving"
          :disabled="!isDirty"
          @click="save"
        />
      </div>
    </template>
  </USlideover>
</template>
