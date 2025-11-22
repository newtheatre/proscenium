<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Performance Reservations
        </h1>
        <p
          v-if="performance"
          class="text-sm text-muted mt-1"
        >
          {{ performance.show.title }} - {{ formatDate(performance.datetime) }}
        </p>
      </div>
    </div>

    <!-- Reservations Table -->
    <UCard>
      <div class="space-y-4">
        <!-- Search Input -->
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search by code, name, or email..."
          class="max-w-md"
        />

        <!-- Table -->
        <UTable
          v-model:column-filters="columnFilters"
          :data="filteredReservations"
          :columns="columns"
          :loading="pending"
          class="w-full"
        >
          <template #status-cell="{ row }">
            <UBadge
              :color="getStatusColor(row.original.status)"
              variant="subtle"
              class="capitalize"
            >
              {{ formatStatus(row.original.status) }}
            </UBadge>
          </template>

          <template #tickets-cell="{ row }">
            <div class="space-y-0.5">
              <div
                v-for="ticket in row.original.reservedTickets"
                :key="ticket.ticketTypeNameAtReservation"
                class="text-sm"
              >
                {{ ticket.quantity }}x {{ ticket.ticketTypeNameAtReservation }}
              </div>
            </div>
          </template>

          <template #totalPrice-cell="{ row }">
            £{{ row.original.totalPrice.toFixed(2) }}
          </template>

          <template #actions-cell="{ row }">
            <div class="flex items-center gap-2">
              <UButton
                v-if="row.original.status === 'PENDING_COLLECTION'"
                color="success"
                size="xs"
                @click="() => openCollectModal(row.original)"
              >
                Collect
              </UButton>

              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                @click="() => openEditModal(row.original)"
              >
                Edit
              </UButton>

              <UButton
                v-if="canCancel(row.original.status)"
                color="error"
                variant="ghost"
                size="xs"
                @click="() => openCancelModal(row.original)"
              >
                Cancel
              </UButton>
            </div>
          </template>
        </UTable>
      </div>
    </UCard>

    <!-- Collect Modal -->
    <UModal
      v-model:open="collectModalOpen"
      title="Collect Reservation"
    >
      <template #body>
        <div
          v-if="selectedReservation"
          class="space-y-4"
        >
          <div>
            <p class="text-sm font-medium">
              Reservation Code
            </p>
            <p class="text-lg font-mono">
              {{ selectedReservation.reservationCode }}
            </p>
          </div>

          <div>
            <p class="text-sm font-medium">
              Customer
            </p>
            <p>{{ selectedReservation.customerName }}</p>
          </div>

          <div>
            <p class="text-sm font-medium">
              Tickets
            </p>
            <ul class="list-disc list-inside">
              <li
                v-for="ticket in selectedReservation.reservedTickets"
                :key="ticket.ticketTypeNameAtReservation"
              >
                {{ ticket.quantity }}x {{ ticket.ticketTypeNameAtReservation }}
              </li>
            </ul>
          </div>

          <div>
            <p class="text-sm font-medium">
              Total
            </p>
            <p class="text-lg font-bold">
              £{{ selectedReservation.totalPrice.toFixed(2) }}
            </p>
          </div>

          <UFormField
            label="Admin Notes (optional)"
            name="adminNotes"
          >
            <UTextarea
              v-model="collectForm.adminNotes"
              placeholder="Add any notes..."
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="collectModalOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="success"
            :loading="collecting"
            @click="handleCollect"
          >
            Mark as Collected
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Edit Modal -->
    <UModal
      v-model:open="editModalOpen"
      title="Edit Reservation"
    >
      <template #body>
        <div
          v-if="selectedReservation"
          class="space-y-4"
        >
          <UFormField
            label="Status"
            name="status"
          >
            <USelectMenu
              v-model="editForm.status"
              :items="statusOptions"
            />
          </UFormField>

          <!-- Tickets Section -->
          <div
            v-if="ticketTypes.length > 0"
            class="space-y-2"
          >
            <label class="text-sm font-medium">
              Tickets
            </label>
            <div class="space-y-2 bg-elevated rounded-lg p-4">
              <div
                v-for="(ticket, index) in editForm.tickets"
                :key="ticket.ticketTypeId"
                class="flex items-center gap-3"
              >
                <div class="flex-1">
                  <p class="text-sm font-medium">
                    {{ ticketTypes.find(tt => tt.id === ticket.ticketTypeId)?.name || 'Unknown' }}
                  </p>
                  <p class="text-xs text-muted">
                    £{{ (ticketTypes.find(tt => tt.id === ticket.ticketTypeId)?.price || 0).toFixed(2) }} each
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    icon="i-lucide-minus"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    :disabled="ticket.quantity === 0"
                    @click="() => { if (editForm.tickets[index]) editForm.tickets[index].quantity = Math.max(0, ticket.quantity - 1) }"
                  />
                  <span class="w-8 text-center font-medium">
                    {{ ticket.quantity }}
                  </span>
                  <UButton
                    icon="i-lucide-plus"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    @click="() => { if (editForm.tickets[index]) editForm.tickets[index].quantity = ticket.quantity + 1 }"
                  />
                </div>
              </div>
              <div class="pt-2 border-t border-border">
                <p class="text-sm font-medium text-right">
                  New Total: £{{ calculateNewTotal().toFixed(2) }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-else
            class="text-sm text-muted"
          >
            Loading ticket types...
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="editModalOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="updating"
            @click="handleUpdate"
          >
            Save Changes
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Cancel Modal -->
    <UModal
      v-model:open="cancelModalOpen"
      title="Cancel Reservation"
    >
      <template #body>
        <div
          v-if="selectedReservation"
          class="space-y-4"
        >
          <p class="text-sm text-muted">
            Are you sure you want to cancel this reservation?
          </p>

          <div class="bg-elevated rounded-lg p-4 space-y-2">
            <div>
              <p class="text-sm font-medium">
                Reservation Code
              </p>
              <p class="font-mono">
                {{ selectedReservation.reservationCode }}
              </p>
            </div>

            <div>
              <p class="text-sm font-medium">
                Customer
              </p>
              <p>
                {{ selectedReservation.customerName }}
              </p>
            </div>

            <div>
              <p class="text-sm font-medium">
                Total
              </p>
              <p>
                £{{ selectedReservation.totalPrice.toFixed(2) }}
              </p>
            </div>
          </div>

          <p class="text-sm text-error">
            This action cannot be undone.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="cancelModalOpen = false"
          >
            Keep Reservation
          </UButton>
          <UButton
            color="error"
            :loading="cancelling"
            @click="handleCancel"
          >
            Cancel Reservation
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import type { TableColumn } from '@nuxt/ui'

interface ReservedTicket {
  id: string
  quantity: number
  ticketTypeNameAtReservation: string
  pricePerItemAtReservation: number
  ticketTypeId: string
}

interface TicketType {
  id: string
  name: string
  price: number
}

interface Reservation {
  id: string
  reservationCode: string
  customerName: string
  status: string
  reservedTickets: ReservedTicket[]
  totalPrice: number
  customerEmail?: string
  customerPhone?: string
  notes?: string
  adminNotes?: string
}

interface Performance {
  id: string
  datetime: string
  show: {
    title: string
  }
}

definePageMeta({
  layout: 'admin',
  middleware: ['auth', 'admin'],
})

const route = useRoute()
const toast = useToast()

const performanceId = route.params.id as string

// Fetch performance details
const { data: performance } = await useFetch<Performance>(
  `/api/v2/performances/${performanceId}`,
  {
    pick: ['id', 'datetime', 'show'],
  },
)

// Fetch available ticket types for this performance from v2 API (SSR)
const { data: ticketTypesData } = await useFetch<Array<{
  ticketType: {
    id: string
    name: string
    description?: string
    defaultPrice: number
    sortOrder: number | null
  }
  price: number
  notes: string | null
  priceSource: string
}>>(`/api/v2/performances/${performanceId}/tickets`)

const ticketTypes = computed<TicketType[]>(() => {
  if (!ticketTypesData.value) return []

  return ticketTypesData.value.map(tt => ({
    id: tt.ticketType.id,
    name: tt.ticketType.name,
    price: tt.price,
  }))
})

// Fetch reservations
const {
  data: reservations,
  pending,
  refresh,
} = await useFetch<Reservation[]>(
  `/api/v2/performances/${performanceId}/reservations`,
)

// Search and filtering
const searchQuery = ref('')
const columnFilters = ref([])

const filteredReservations = computed(() => {
  if (!reservations.value) return []

  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return reservations.value

  return reservations.value.filter((reservation) => {
    const searchableText = [
      reservation.reservationCode,
      reservation.customerName,
      reservation.customerEmail || '',
      reservation.status,
      ...reservation.reservedTickets.map(t => t.ticketTypeNameAtReservation),
    ]
      .join(' ')
      .toLowerCase()

    return searchableText.includes(query)
  })
})

// Table columns
const columns: TableColumn<Reservation>[] = [
  {
    accessorKey: 'reservationCode',
    header: 'Code',
    cell: ({ row }) => h('span', { class: 'font-mono text-sm' }, row.getValue('reservationCode')),
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
  },
  {
    accessorKey: 'status',
    header: 'Status',
  },
  {
    id: 'tickets',
    header: 'Tickets',
  },
  {
    accessorKey: 'totalPrice',
    header: () => h('div', { class: 'text-right' }, 'Total'),
    cell: ({ row }) => {
      const price = row.getValue('totalPrice') as number
      return h('div', { class: 'text-right font-medium' }, `£${price.toFixed(2)}`)
    },
  },
  {
    id: 'actions',
    header: 'Actions',
  },
]

// Modal states
const collectModalOpen = ref(false)
const editModalOpen = ref(false)
const cancelModalOpen = ref(false)
const selectedReservation = ref<Reservation | null>(null)

// Loading states
const collecting = ref(false)
const updating = ref(false)
const cancelling = ref(false)

// Form states
const collectForm = ref({
  adminNotes: '',
})

const editForm = ref<{
  status: { label: string, value: string } | undefined
  tickets: Array<{ ticketTypeId: string, quantity: number }>
}>({
  status: undefined,
  tickets: [],
})

const statusOptions = [
  { label: 'Pending Collection', value: 'PENDING_COLLECTION' },
  { label: 'Collected', value: 'COLLECTED' },
  { label: 'Purchased on Door', value: 'PURCHASED_ON_DOOR' },
  { label: 'Cancelled by Customer', value: 'CANCELLED_BY_CUSTOMER' },
  { label: 'Cancelled by Admin', value: 'CANCELLED_BY_ADMIN' },
  { label: 'No Show', value: 'NO_SHOW' },
  { label: 'Expired', value: 'EXPIRED' },
]

// Helper functions
function getStatusColor(status: string): 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral' {
  const colorMap: Record<string, 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
    PENDING_COLLECTION: 'warning',
    COLLECTED: 'success',
    PURCHASED_ON_DOOR: 'success',
    CANCELLED_BY_CUSTOMER: 'error',
    CANCELLED_BY_ADMIN: 'error',
    NO_SHOW: 'neutral',
    EXPIRED: 'neutral',
  }
  return colorMap[status] || 'neutral'
}

function formatStatus(status: string) {
  return status
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function canCancel(status: string) {
  return ['PENDING_COLLECTION', 'COLLECTED'].includes(status)
}

function calculateNewTotal() {
  return editForm.value.tickets.reduce((total, ticket) => {
    const ticketType = ticketTypes.value.find(tt => tt.id === ticket.ticketTypeId)
    if (!ticketType) return total
    return total + (ticketType.price * ticket.quantity)
  }, 0)
}

// Modal handlers
function openCollectModal(reservation: Reservation) {
  selectedReservation.value = reservation
  collectForm.value.adminNotes = reservation.adminNotes || ''
  collectModalOpen.value = true
}

function openEditModal(reservation: Reservation) {
  selectedReservation.value = reservation
  const statusOption = statusOptions.find(opt => opt.value === reservation.status)

  // Build tickets map from current reservation
  const ticketsMap = new Map<string, number>()
  reservation.reservedTickets.forEach((ticket) => {
    ticketsMap.set(ticket.ticketTypeId, ticket.quantity)
  })

  // Initialize form with all available ticket types
  const ticketsArray = ticketTypes.value.map(tt => ({
    ticketTypeId: tt.id,
    quantity: ticketsMap.get(tt.id) || 0,
  }))

  editForm.value = {
    status: statusOption || undefined,
    tickets: ticketsArray,
  }
  editModalOpen.value = true
}

function openCancelModal(reservation: Reservation) {
  selectedReservation.value = reservation
  cancelModalOpen.value = true
}

// API handlers
async function handleCollect() {
  if (!selectedReservation.value) return

  collecting.value = true

  try {
    await $fetch(
      `/api/v2/reservations/${selectedReservation.value.reservationCode}/collect`,
      {
        method: 'PUT',
        body: {
          adminNotes: collectForm.value.adminNotes || undefined,
        },
      },
    )

    toast.add({
      title: 'Reservation collected',
      description: `Reservation ${selectedReservation.value.reservationCode} marked as collected.`,
      color: 'success',
      icon: 'i-lucide-check-circle',
    })

    collectModalOpen.value = false
    collectForm.value.adminNotes = ''
    await refresh()
  }
  catch (error: unknown) {
    const errorMessage = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data
      ? String(error.data.message)
      : 'An error occurred'

    toast.add({
      title: 'Failed to collect reservation',
      description: errorMessage,
      color: 'error',
      icon: 'i-lucide-x-circle',
    })
  }
  finally {
    collecting.value = false
  }
}

async function handleUpdate() {
  if (!selectedReservation.value) return

  updating.value = true

  try {
    await $fetch(
      `/api/v2/reservations/${selectedReservation.value.reservationCode}`,
      {
        method: 'PUT',
        body: {
          status: editForm.value.status?.value,
          tickets: editForm.value.tickets,
        },
      },
    )

    toast.add({
      title: 'Reservation updated',
      description: `Reservation ${selectedReservation.value.reservationCode} has been updated.`,
      color: 'success',
      icon: 'i-lucide-check-circle',
    })

    editModalOpen.value = false
    await refresh()
  }
  catch (error: unknown) {
    const errorMessage = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data
      ? String(error.data.message)
      : 'An error occurred'

    toast.add({
      title: 'Failed to update reservation',
      description: errorMessage,
      color: 'error',
      icon: 'i-lucide-x-circle',
    })
  }
  finally {
    updating.value = false
  }
}

async function handleCancel() {
  if (!selectedReservation.value) return

  cancelling.value = true

  try {
    await $fetch(
      `/api/v2/reservations/${selectedReservation.value.reservationCode}/cancel`,
      {
        method: 'PUT',
      },
    )

    toast.add({
      title: 'Reservation cancelled',
      description: `Reservation ${selectedReservation.value.reservationCode} has been cancelled.`,
      color: 'success',
      icon: 'i-lucide-check-circle',
    })

    cancelModalOpen.value = false
    await refresh()
  }
  catch (error: unknown) {
    const errorMessage = error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data
      ? String(error.data.message)
      : 'An error occurred'

    toast.add({
      title: 'Failed to cancel reservation',
      description: errorMessage,
      color: 'error',
      icon: 'i-lucide-x-circle',
    })
  }
  finally {
    cancelling.value = false
  }
}
</script>
