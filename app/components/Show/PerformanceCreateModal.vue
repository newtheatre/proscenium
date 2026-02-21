/**
 * Create Performance Modal Component
 *
 * Modal for adding a new performance to an existing show.
 *
 * @prop showId — The show to add the performance to
 * @emits close — Emitted when the modal should close
 * @emits refresh — Emitted after successful creation
 */
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = defineProps<{
  showId: string | null
  /** Status of the parent show — determines initial performance status. */
  showStatus?: 'DRAFT' | 'PUBLISHED'
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

interface Venue {
  id: string
  name: string
  capacity?: number | null
}

const { data: venues } = await useFetch<Venue[]>('/api/venues')
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
  notes: z.string().optional(),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  venueId: undefined,
  date: '',
  time: '19:30',
  doorsTime: '19:00',
  durationMinutes: null,
  intervalCount: 0,
  intervalMinutes: null,
  capacityOverride: null,
  notes: '',
})

let doorsManuallyEdited: boolean = false

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

// Set default venue when venues load
watch(venues, (v) => {
  if (v?.[0] && !state.venueId) {
    state.venueId = v[0].id
  }
  // Also prime doors time
  state.doorsTime = autoDoorsTime(state.time ?? '')
}, { immediate: true })

const venueItems = computed(
  () => venues.value?.map(v => ({ label: v.name, value: v.id })) ?? [],
)

function toUnix(date: string, time: string): number | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}:00`)
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000)
}

function resetForm() {
  state.venueId = venues.value?.[0]?.id
  state.date = ''
  state.time = '19:30'
  state.doorsTime = autoDoorsTime('19:30')
  state.durationMinutes = null
  state.intervalCount = 0
  state.intervalMinutes = null
  state.capacityOverride = null
  state.notes = ''
  doorsManuallyEdited = false
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.showId) return

  const startsAt = toUnix(event.data.date, event.data.time)
  if (!startsAt) {
    toast.add({ title: 'Invalid date/time', color: 'error' })
    return
  }

  isSubmitting.value = true
  try {
    await $fetch(`/api/shows/${props.showId}/performances`, {
      method: 'POST',
      body: {
        venueId: event.data.venueId,
        startsAt,
        doorsAt: event.data.doorsTime ? toUnix(event.data.date, event.data.doorsTime) : null,
        durationMinutes: event.data.durationMinutes,
        intervalCount: event.data.intervalCount,
        intervalMinutes: event.data.intervalMinutes,
        capacityOverride: event.data.capacityOverride,
        // Derive status from parent show: published shows have on-sale performances by default
        status: props.showStatus === 'PUBLISHED' ? 'ON_SALE' : 'DRAFT',
        notes: event.data.notes || null,
      },
    })

    toast.add({
      title: 'Performance created',
      description: `Performance on ${event.data.date} has been added`,
      icon: 'i-lucide-check',
      color: 'success',
    })

    resetForm()
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error, 'Failed to create performance'),
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
    :open="!!showId"
    title="Add performance"
    description="Schedule a new performance for this show."
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
              @change="doorsManuallyEdited = true"
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
            label="Add performance"
            icon="i-lucide-plus"
            :loading="isSubmitting"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
