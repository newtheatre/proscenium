<script setup lang="ts">
/**
 * Customer self-service: cancel, or change the ticket composition. Shown only
 * for a PENDING booking on a future performance (ADR-0011).
 */
interface BookingTicket {
  id: string
  pricePaid: number
  /** Set once the box office has refunded this specific ticket. */
  refundedAt: string | Date | null
  ticketType: { id: string, name: string }
}

interface Booking {
  id: string
  bookingRef: string
  status: string
  performance: {
    id: string
    startsAt: string | Date
    show: { slug: string }
  }
  tickets: BookingTicket[]
}

interface ShowTicketType {
  id: string
  name: string
  description: string | null
  effectivePrice: number
}

interface ShowPerformance {
  id: string
  ticketTypes: ShowTicketType[]
  ticketsSold: number
  capacity: number | null
}

const props = defineProps<{
  booking: Booking
  accessToken?: string
}>()

const emit = defineEmits<{ refresh: [] }>()

const toast = useToast()
const confirm = useConfirm()

const accessQuery = computed(() => (props.accessToken ? { t: props.accessToken } : undefined))

const canManage = computed(() =>
  props.booking.status === 'PENDING'
  && new Date(props.booking.performance.startsAt).getTime() > Date.now(),
)

// ── Cancel ──────────────────────────────────────────────────────────────────
const cancelling = ref(false)

async function cancelBooking() {
  const ok = await confirm({
    title: 'Cancel this booking?',
    description: 'Your tickets will be released and a confirmation email sent. This cannot be undone.',
    confirmLabel: 'Cancel booking',
    confirmColor: 'error',
    icon: 'i-lucide-x-circle',
  })
  if (!ok) return

  cancelling.value = true
  try {
    await $fetch(`/api/bookings/${props.booking.id}/cancel`, { method: 'POST', query: accessQuery.value })
    toast.add({ title: 'Booking cancelled', icon: 'i-lucide-check-circle', color: 'success' })
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Could not cancel',
      description: getErrorMessage(error, 'Please try again or contact the box office.'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    cancelling.value = false
  }
}

// ── Edit tickets ────────────────────────────────────────────────────────────
const editing = ref(false)
const saving = ref(false)
const selection = ref<Array<{ ticketTypeId: string, quantity: number }>>([])

// Active ticket types + capacity come from the public what's-on data.
// Lazy (no await) so it never suspends the page: only needed when editing.
const { data: showData } = useFetch<{ performances: ShowPerformance[] }>(
  () => `/api/whats-on/${props.booking.performance.show.slug}`,
  { key: `manage-show-${props.booking.id}`, lazy: true },
)

const performance = computed(() =>
  showData.value?.performances?.find(p => p.id === props.booking.performance.id) ?? null,
)

const ticketTypes = computed(() => performance.value?.ticketTypes ?? [])

/**
 * There should be no refunded tickets here at all; filtered anyway, because the
 * server diffs on `isNull(refundedAt)` (ADR-0011).
 */
const activeTickets = computed(() => props.booking.tickets.filter(t => !t.refundedAt))

const currentCount = computed(() => activeTickets.value.length)

// Seats the customer may occupy: what's free now plus the seats they already hold.
const remainingCapacity = computed(() => {
  const perf = performance.value
  if (!perf || perf.capacity == null) return null
  return Math.max(0, perf.capacity - perf.ticketsSold + currentCount.value)
})

/**
 * Types held when editing started. The stepper drops an entry at zero and the
 * server only diffs the types named, so removal needs this.
 */
const editedTypeIds = ref<string[]>([])

function startEditing() {
  const counts = new Map<string, number>()
  for (const t of activeTickets.value) {
    counts.set(t.ticketType.id, (counts.get(t.ticketType.id) ?? 0) + 1)
  }
  selection.value = Array.from(counts, ([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))
  editedTypeIds.value = [...counts.keys()]
  editing.value = true
}

const selectionTotal = computed(() => selection.value.reduce((sum, t) => sum + t.quantity, 0))

async function saveTickets() {
  if (selectionTotal.value < 1) {
    toast.add({ title: 'Keep at least one ticket', description: 'To remove everything, cancel the booking instead.', color: 'warning', icon: 'i-lucide-triangle-alert' })
    return
  }
  saving.value = true
  try {
    // Explicit zeros for types the customer emptied, so the server sees the
    // removal instead of leaving those tickets untouched.
    const requested = new Map(selection.value.map(t => [t.ticketTypeId, t.quantity]))
    for (const id of editedTypeIds.value) {
      if (!requested.has(id)) requested.set(id, 0)
    }

    await $fetch(`/api/bookings/${props.booking.id}/tickets`, {
      method: 'PUT',
      query: accessQuery.value,
      body: { tickets: Array.from(requested, ([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })) },
    })
    toast.add({ title: 'Booking updated', icon: 'i-lucide-check-circle', color: 'success' })
    editing.value = false
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Could not update booking',
      description: getErrorMessage(error, 'Please try again or contact the box office.'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard v-if="canManage">
    <template #header>
      <h3 class="font-semibold text-default">
        Manage your booking
      </h3>
    </template>

    <div
      v-if="!editing"
      class="flex flex-col sm:flex-row gap-3"
    >
      <UButton
        label="Change tickets"
        icon="i-lucide-pencil"
        variant="outline"
        color="neutral"
        :disabled="ticketTypes.length === 0"
        @click="startEditing"
      />
      <UButton
        label="Cancel booking"
        icon="i-lucide-x-circle"
        variant="outline"
        color="error"
        :loading="cancelling"
        @click="cancelBooking"
      />
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <BookingTicketSelect
        v-model="selection"
        :ticket-types="ticketTypes"
        :remaining-capacity="remainingCapacity"
      />
      <div class="flex justify-end gap-3">
        <UButton
          label="Discard"
          variant="ghost"
          color="neutral"
          :disabled="saving"
          @click="() => { editing = false }"
        />
        <UButton
          label="Save changes"
          icon="i-lucide-check"
          :loading="saving"
          @click="saveTickets"
        />
      </div>
    </div>
  </UCard>
</template>
