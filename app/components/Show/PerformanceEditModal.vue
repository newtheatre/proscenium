/**
 * Edit Performance Modal Component
 *
 * Modal for editing an existing performance's details.
 *
 * @prop performance — The performance to edit (null = modal closed)
 * @emits close — Emitted when the modal should close
 * @emits refresh — Emitted after successful update
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

interface Performance {
  id: string
  showId: string
  venueId: string
  startsAt: number | string | Date
  doorsAt?: number | string | Date | null
  durationMinutes?: number | null
  intervalCount: number
  intervalMinutes?: number | null
  capacityOverride?: number | null
  bookingClosesHoursBefore?: number | null
  status: 'DRAFT' | 'ON_SALE' | 'CANCELLED'
  notes?: string | null
}

const props = defineProps<{
  performance: Performance | null
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

const { data: venues } = useVenues()
const toast = useToast()
const isSubmitting = ref(false)

const schema = z.object({
  venueId: z.string().min(1, 'Venue is required'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Start time is required'),
  doorsTime: z.string().optional(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  intervalCount: z.number().int().nonnegative().default(0),
  intervalMinutes: z.number().int().positive().optional().nullable(),
  capacityOverride: z.number().int().positive().optional().nullable(),
  bookingClosesHoursBefore: z.number().int().nonnegative().max(168).optional().nullable(),
  notes: z.string().optional(),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  venueId: undefined,
  date: '',
  time: '19:30',
  doorsTime: '',
  durationMinutes: null,
  intervalCount: 0,
  intervalMinutes: null,
  capacityOverride: null,
  bookingClosesHoursBefore: null,
  notes: '',
})

let doorsManuallyEdited: boolean = false
function markDoorsEdited() {
  doorsManuallyEdited = true
}

function autoDoorsTime(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return ''
  const totalMin = h * 60 + m - 30
  const dh = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60)
  const dm = ((totalMin % 1440) + 1440) % 1440 % 60
  return `${String(dh).padStart(2, '0')}:${String(dm).padStart(2, '0')}`
}

function onTimeChange() {
  if (!doorsManuallyEdited) {
    state.doorsTime = autoDoorsTime(state.time ?? '')
  }
}

function toDateString(val: number | string | Date | null | undefined): string {
  if (!val) return ''
  const d = val instanceof Date ? val : new Date(typeof val === 'number' ? val * 1000 : val)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function toTimeString(val: number | string | Date | null | undefined): string {
  if (!val) return ''
  const d = val instanceof Date ? val : new Date(typeof val === 'number' ? val * 1000 : val)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

watch(
  () => props.performance,
  (perf) => {
    if (perf) {
      state.venueId = perf.venueId
      state.date = toDateString(perf.startsAt)
      state.time = toTimeString(perf.startsAt)
      state.doorsTime = perf.doorsAt ? toTimeString(perf.doorsAt) : ''
      state.durationMinutes = perf.durationMinutes ?? null
      state.intervalCount = perf.intervalCount
      state.intervalMinutes = perf.intervalMinutes ?? null
      state.capacityOverride = perf.capacityOverride ?? null
      state.bookingClosesHoursBefore = perf.bookingClosesHoursBefore ?? null
      state.notes = perf.notes ?? ''
      doorsManuallyEdited = !!perf.doorsAt // treat existing doors as manually set
    }
  },
  { immediate: true },
)

const venueItems = computed(
  () => venues.value?.map(v => ({ label: v.name, value: v.id })) ?? [],
)

function toUnix(date: string, time: string): number | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}:00`)
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000)
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.performance) return

  const startsAt = toUnix(event.data.date, event.data.time)
  if (!startsAt) {
    toast.add({ title: 'Invalid date/time', color: 'error' })
    return
  }

  isSubmitting.value = true
  try {
    await $fetch(
      `/api/shows/${props.performance.showId}/performances/${props.performance.id}`,
      {
        method: 'PUT',
        body: {
          venueId: event.data.venueId,
          startsAt,
          doorsAt: event.data.doorsTime ? toUnix(event.data.date, event.data.doorsTime) : null,
          durationMinutes: event.data.durationMinutes,
          intervalCount: event.data.intervalCount,
          intervalMinutes: event.data.intervalMinutes,
          capacityOverride: event.data.capacityOverride,
          bookingClosesHoursBefore: event.data.bookingClosesHoursBefore,
          // Status is intentionally omitted here — managed via show publish/cancel actions
          notes: event.data.notes || null,
        },
      },
    )

    toast.add({
      title: 'Performance updated',
      icon: 'i-lucide-check',
      color: 'success',
    })
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to update performance'),
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
    :open="!!performance"
    title="Edit performance"
    description="Update the performance date, venue, and settings."
    @close="emit('close')"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          name="venueId"
          label="Venue"
          required
        >
          <USelect
            v-model="state.venueId"
            :items="venueItems"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField
            name="date"
            label="Date"
            required
          >
            <UInput
              v-model="state.date"
              type="date"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="time"
            label="Start time"
            required
          >
            <UInput
              v-model="state.time"
              type="time"
              class="w-full"
              @change="onTimeChange"
            />
          </UFormField>

          <UFormField
            name="doorsTime"
            label="Doors open"
          >
            <UInput
              v-model="state.doorsTime"
              type="time"
              class="w-full"
              @change="markDoorsEdited"
            />
          </UFormField>

          <UFormField
            name="durationMinutes"
            label="Duration (minutes)"
          >
            <UInput
              v-model.number="state.durationMinutes"
              type="number"
              min="1"
              placeholder="120"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="intervalCount"
            label="Intervals"
          >
            <UInput
              v-model.number="state.intervalCount"
              type="number"
              min="0"
              max="5"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="intervalMinutes"
            label="Interval length (min)"
          >
            <UInput
              v-model.number="state.intervalMinutes"
              type="number"
              min="1"
              placeholder="20"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="capacityOverride"
            label="Capacity override"
          >
            <UInput
              v-model.number="state.capacityOverride"
              type="number"
              min="1"
              placeholder="Venue default"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          name="bookingClosesHoursBefore"
          label="Close online booking"
          help="Hours before the start time. Leave blank to keep booking open until curtain-up. The box office can still sell on the door afterwards."
        >
          <UInput
            v-model.number="state.bookingClosesHoursBefore"
            type="number"
            min="0"
            max="168"
            placeholder="0"
            class="w-full"
          >
            <template #trailing>
              <span class="text-xs text-muted">hours before</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField
          name="notes"
          label="Internal notes"
        >
          <UInput
            v-model="state.notes"
            placeholder="Production or scheduling notes..."
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="subtle"
            :disabled="isSubmitting"
            @click="emit('close')"
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
