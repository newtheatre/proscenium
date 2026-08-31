<script setup lang="ts">
import { TIERS } from '#shared/utils/bookings'
import { formatLondon, fromLondonWallClock } from '#shared/utils/london'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { RoomHours } from '#shared/utils/rooms'
import { z } from 'zod'

definePageMeta({ middleware: 'signed-in' })

interface Room {
  id: string
  name: string
  capacity: number | null
  sensitive: boolean
  isExternal: boolean
  hours: RoomHours[]
}

interface Failure { reason: string, says: string }

const route = useRoute()
const toast = useToast()
const request = useRequestFetch()

// The screen mirrors the rules; the API is the authority, so what comes back is what is shown
// rather than a second copy of the policy (C-106 criterion 3).
const form = z.object({
  roomId: z.string().min(1, 'Choose a room'),
  title: z.string().trim().min(1, 'Say what the booking is for').max(200),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a day'),
  from: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a start time'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'Choose an end time'),
  attendees: z.number().int().positive().nullish(),
  tier: z.enum(TIERS),
}).refine(booking => booking.to > booking.from, {
  path: ['to'],
  message: 'A booking ends after it starts',
})

const state = reactive({
  roomId: String(route.query.room ?? ''),
  title: '',
  day: String(route.query.day ?? ''),
  from: String(route.query.at ?? '10:00'),
  to: addMinutes(String(route.query.at ?? '10:00'), 60),
  attendees: undefined as number | undefined,
  tier: 'GENERAL' as (typeof TIERS)[number],
})

const saving = ref(false)
const failures = ref<Failure[]>([])
const askInstead = ref(false)

const { data: rooms } = await useAsyncData(
  'bookable-rooms',
  async () => (await request<{ rooms: Room[] }>('/api/rooms/availability', {
    query: { from: today(), to: today() },
  })).rooms,
  { default: (): Room[] => [] },
)

const room = computed(() => rooms.value.find(one => one.id === state.roomId))

function today(): string {
  return formatLondon(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-')
}

function addMinutes(clock: string, minutes: number): string {
  const [hour, minute] = clock.split(':').map(Number)
  const total = Math.min((hour! * 60 + minute! + minutes), 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// The wall clock the member typed, turned into the instant it names in London (0014).
function instantOf(day: string, clock: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = clock.split(':').map(Number)
  return fromLondonWallClock(year!, month!, date!, hour!, minute!).toISOString()
}

// Said before submitting, not after: a room somebody else books, or one that always asks, is
// worth knowing about while the form is still being filled in (C-105 criterion 5).
const warnsUpFront = computed(() => {
  if (room.value?.isExternal) {
    return 'This room is booked through the SU. Your request goes to the Theatre Manager, who fills in their form.'
  }
  if (room.value?.sensitive) return 'Every booking for this room is agreed by a person before it is held.'
  return null
})

async function book(event: FormSubmitEvent<z.output<typeof form>>): Promise<void> {
  saving.value = true
  failures.value = []
  askInstead.value = false

  try {
    const answer = await $fetch<{ id: string, warning: string | null }>('/api/rooms/bookings', {
      method: 'POST',
      body: {
        roomId: event.data.roomId,
        title: event.data.title,
        startsAt: instantOf(event.data.day, event.data.from),
        endsAt: instantOf(event.data.day, event.data.to),
        attendees: event.data.attendees ?? null,
        tier: event.data.tier,
      },
    })

    toast.add({ title: 'Booked', icon: 'i-lucide-check', color: 'success' })
    if (answer.warning) toast.add({ title: answer.warning, color: 'warning' })
    await navigateTo('/rooms')
  }
  catch (error) {
    const data = refusalData<{ failures?: Failure[], canRequest?: boolean, conflicts?: unknown[] }>(error)
    failures.value = data?.failures ?? []
    askInstead.value = data?.canRequest ?? false
    if (failures.value.length === 0) toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

useSeoMeta({ title: 'Book a room' })
</script>

<template>
  <UContainer class="max-w-xl py-16">
    <UPageHeader
      title="Book a room"
      description="A booking inside the rules is held straight away. One outside them is a request somebody decides on."
    />

    <UPageCard class="mt-8">
      <UForm
        :schema="form"
        :state="state"
        class="space-y-5"
        data-test="booking-form"
        @submit="book"
      >
        <UFormField
          label="Room"
          name="roomId"
          required
        >
          <USelect
            v-model="state.roomId"
            :items="rooms.map(one => ({ label: one.name, value: one.id }))"
            placeholder="Choose a room"
            class="w-full"
            data-test="booking-room"
          />
        </UFormField>

        <UAlert
          v-if="warnsUpFront"
          color="warning"
          variant="subtle"
          icon="i-lucide-hand"
          :description="warnsUpFront"
          data-test="booking-warns"
        />

        <UFormField
          label="What it is for"
          name="title"
          required
          description="Shown to officers, and to nobody else looking at the calendar."
        >
          <UInput
            v-model="state.title"
            class="w-full"
            data-test="booking-title"
          />
        </UFormField>

        <UFormField
          label="Day"
          name="day"
          required
        >
          <DateField
            v-model="state.day"
            data-test="booking-day"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="From"
            name="from"
            required
          >
            <UInput
              v-model="state.from"
              type="time"
              class="w-full"
              data-test="booking-from"
            />
          </UFormField>

          <UFormField
            label="Until"
            name="to"
            required
          >
            <UInput
              v-model="state.to"
              type="time"
              class="w-full"
              data-test="booking-to"
            />
          </UFormField>
        </div>

        <UFormField
          label="How many people"
          name="attendees"
          hint="Optional"
          :description="room?.capacity ? `The room holds ${room.capacity}. More is allowed, and worth checking.` : undefined"
        >
          <UInputNumber
            v-model="state.attendees"
            :min="1"
            class="w-full"
            data-test="booking-attendees"
          />
        </UFormField>

        <UFormField
          label="What kind of booking"
          name="tier"
        >
          <USelect
            v-model="state.tier"
            :items="TIERS.map(tier => ({ label: tier.charAt(0) + tier.slice(1).toLowerCase(), value: tier }))"
            class="w-full"
            data-test="booking-tier"
          />
        </UFormField>

        <UAlert
          v-if="failures.length"
          :color="askInstead ? 'warning' : 'error'"
          variant="subtle"
          :title="askInstead ? 'This one needs somebody to agree to it' : 'That booking cannot be made'"
          data-test="booking-failures"
        >
          <template #description>
            <ul class="mt-1 list-disc ps-4">
              <li
                v-for="failure in failures"
                :key="failure.reason"
              >
                {{ failure.says }}
              </li>
            </ul>
            <p
              v-if="askInstead"
              class="mt-2"
            >
              Asking is not built yet, so for now speak to the Theatre Manager.
            </p>
          </template>
        </UAlert>

        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            :loading="saving"
            data-test="booking-submit"
          >
            Book it
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            to="/rooms"
          >
            Back to the calendar
          </UButton>
        </div>
      </UForm>
    </UPageCard>
  </UContainer>
</template>
