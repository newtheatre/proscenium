/**
 * Edit a reservation's status and notes. Staff only. `cancelledBy` is required
 * when cancelling; `staffNotes` never reaches the customer.
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent, SelectItem } from '@nuxt/ui'

interface Reservation {
  id: string
  bookingRef: string
  status: 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW'
  cancelledBy?: 'CUSTOMER' | 'STAFF' | null
  customerNotes?: string | null
  staffNotes?: string | null
  user: { id: string, name: string, email: string }
  performance: {
    id: string
    startsAt: string | number
    show: { id: string, title: string }
    venue: { id: string, name: string }
  }
}

const props = defineProps<{ reservation: Reservation | null }>()
const emit = defineEmits<{
  refresh: []
  close: []
}>()

const open = computed({
  get: () => !!props.reservation,
  set: (value) => { if (!value) emit('close') },
})

const toast = useToast()
const isSubmitting = ref(false)

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  status: z.enum(['PENDING', 'COLLECTED', 'DOOR', 'CANCELLED', 'NO_SHOW']),
  cancelledBy: z.enum(['CUSTOMER', 'STAFF']).optional(),
  customerNotes: z.string().optional(),
  staffNotes: z.string().optional(),
}).refine(
  data => !(data.status === 'CANCELLED' && !data.cancelledBy),
  { message: 'Please specify who cancelled this reservation', path: ['cancelledBy'] },
)

type Schema = z.output<typeof schema>

// ── State ─────────────────────────────────────────────────────────────────────

const state = reactive<{
  status?: Schema['status']
  cancelledBy?: 'CUSTOMER' | 'STAFF'
  customerNotes?: string
  staffNotes?: string
}>({
  status: undefined,
  cancelledBy: undefined,
  customerNotes: undefined,
  staffNotes: undefined,
})

// Reset state whenever the reservation changes
watch(() => props.reservation, (r) => {
  if (!r) return
  state.status = r.status
  state.cancelledBy = (r.cancelledBy ?? undefined) as 'CUSTOMER' | 'STAFF' | undefined
  state.customerNotes = r.customerNotes ?? ''
  state.staffNotes = r.staffNotes ?? ''
}, { immediate: true })

const showCancelledBy = computed(() => state.status === 'CANCELLED')

// ── Options ───────────────────────────────────────────────────────────────────

const statusOptions = ref<SelectItem[]>([
  { label: 'Pending', value: 'PENDING' },
  { label: 'Collected', value: 'COLLECTED' },
  { label: 'Door purchase', value: 'DOOR' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'No show', value: 'NO_SHOW' },
])

const cancelledByOptions = ref<SelectItem[]>([
  { label: 'Cancelled by customer', value: 'CUSTOMER' },
  { label: 'Cancelled by staff', value: 'STAFF' },
])

// ── Submit ────────────────────────────────────────────────────────────────────

async function onSubmit(_event: FormSubmitEvent<Schema>) {
  if (!props.reservation) return
  isSubmitting.value = true

  const payload: Record<string, unknown> = {
    status: state.status,
    customerNotes: state.customerNotes ?? null,
    staffNotes: state.staffNotes ?? null,
  }

  if (state.status === 'CANCELLED') {
    payload.cancelledBy = state.cancelledBy ?? null
  }
  else {
    payload.cancelledBy = null
  }

  try {
    await $fetch(`/api/reservations/${props.reservation.id}`, {
      method: 'PUT',
      body: payload,
    })
    toast.add({
      title: 'Reservation updated',
      description: `Booking ${props.reservation.bookingRef} has been updated`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    emit('refresh')
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
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Edit Reservation ${reservation?.bookingRef}`"
    description="Update the status and notes for this reservation"
    :ui="{ body: 'space-y-4' }"
  >
    <template #body>
      <!-- Customer summary -->
      <div
        v-if="reservation"
        class="flex items-center gap-3 p-3 rounded-lg bg-elevated border border-default"
      >
        <UIcon
          name="i-lucide-user"
          class="text-muted shrink-0"
        />
        <div class="min-w-0">
          <p class="font-medium text-sm text-highlighted truncate">
            {{ reservation.user.name }}
          </p>
          <p class="text-xs text-muted truncate">
            {{ reservation.user.email }}
          </p>
        </div>
        <div class="ml-auto min-w-0 text-right">
          <p class="text-sm font-medium text-highlighted truncate">
            {{ reservation.performance.show.title }}
          </p>
          <p class="text-xs text-muted truncate">
            {{ reservation.performance.venue.name }}
          </p>
        </div>
      </div>

      <!-- Edit form -->
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          name="status"
          label="Status"
          required
        >
          <USelect
            v-model="state.status"
            :items="statusOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="showCancelledBy"
          name="cancelledBy"
          label="Cancelled by"
          required
        >
          <USelect
            v-model="state.cancelledBy"
            :items="cancelledByOptions"
            value-key="value"
            label-key="label"
            placeholder="Select who cancelled"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="customerNotes"
          label="Customer notes"
          description="Requests submitted by the customer (accessibility, dietary needs)"
        >
          <UTextarea
            v-model="state.customerNotes"
            placeholder="No customer notes"
            :rows="3"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="staffNotes"
          label="Staff notes"
          description="Internal box-office notes: not visible to the customer"
        >
          <UTextarea
            v-model="state.staffNotes"
            placeholder="No staff notes"
            :rows="3"
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            @click="() => { open = false }"
          />
          <UButton
            type="submit"
            label="Save changes"
            :loading="isSubmitting"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
