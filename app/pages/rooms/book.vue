<script setup lang="ts">
import { TIERS, describePurpose } from '#shared/utils/bookings'
import { saysRecurrence } from '#shared/utils/series'
import type { FREQUENCIES } from '#shared/utils/series'
import { overCapacity } from '#shared/utils/rooms'
import { REQUEST_REASON_LIMIT } from '#shared/utils/requests'
import { formatLondon, fromLondonWallClock, londonWeekday } from '#shared/utils/london'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { RoomHours } from '#shared/utils/rooms'
import { z } from 'zod'

definePageMeta({ middleware: 'signed-in' })

interface Room {
  id: string
  name: string
  capacity: number | null
  sensitive: boolean
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
  purpose: z.string().min(1, 'Say what the room is for'),
}).refine(booking => booking.to > booking.from, {
  path: ['to'],
  message: 'A booking ends after it starts',
})

const state = reactive({
  roomId: String(route.query.room ?? ''),
  title: '',
  day: String(route.query.day ?? ''),
  from: String(route.query.at ?? '10:00'),
  // A drag across the calendar arrives with both ends; a single click brings one and an hour.
  to: String(route.query.until ?? addMinutes(String(route.query.at ?? '10:00'), 60)),
  attendees: undefined as number | undefined,
  tier: 'GENERAL' as (typeof TIERS)[number],
  // Never defaulted, but taken from the link: a QR code an officer made says what the room is for,
  // and a value nobody chose is the failure the notes exist to remove (C-119).
  purpose: String(route.query.purpose ?? ''),
})

const saving = ref(false)
const failures = ref<Failure[]>([])
const askInstead = ref(false)
const reason = ref('')

// A term of rehearsals is one action, so repeating is part of this form rather than a screen of
// its own (C-110). Off by default: most bookings are one evening.
const repeats = ref(false)
const frequency = ref<(typeof FREQUENCIES)[number]>('WEEKLY')
const weekdays = ref<number[]>([])
const occurrences = ref(4)
const refusals = ref<{ occurrence: number, day: string, failures: Failure[], conflicts: unknown[] }[]>([])

// Read rather than restated: the cap is committee-editable, and a number written into a screen
// stops being true the moment they change it (0012).
const { data: rules } = await useAsyncData(
  'room-policy',
  () => request<{ seriesCap: number, purposes: string[] }>('/api/rooms/policy'),
  { default: () => ({ seriesCap: 12, purposes: [] as string[] }) },
)

const purposeOptions = computed(() =>
  rules.value.purposes.map(purpose => ({ label: describePurpose(purpose), value: purpose })))
const seriesCap = computed(() => rules.value.seriesCap)

// Said before submitting, not after: a member on the ladder should know every booking is going to
// be checked by a person before they fill the form in (C-116 criterion 4).
const { data: standing } = await useAsyncData(
  'my-standing',
  () => request<{ standing: string, says: string }>('/api/rooms/standing'),
  { default: () => ({ standing: 'CLEAR', says: '' }) },
)

const WEEKDAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
]

// The day the member picked, so a weekly series starts on the day they were looking at. Immediate,
// because a deep link from the calendar arrives with the day already set.
watch(() => state.day, (day) => {
  if (!day || weekdays.value.length > 0) return
  const [year, month, date] = day.split('-').map(Number)
  weekdays.value = [londonWeekday(fromLondonWallClock(year!, month!, date!, 12))]
}, { immediate: true })

const recurrence = computed(() => ({
  frequency: frequency.value,
  weekdays: weekdays.value,
  startsOn: state.day,
  from: state.from,
  to: state.to,
  occurrences: occurrences.value,
}))

const seriesReady = computed(() =>
  Boolean(state.roomId && state.title.trim() && state.day && state.purpose)
  && (frequency.value === 'DAILY' || weekdays.value.length > 0))

async function bookSeries(): Promise<void> {
  saving.value = true
  failures.value = []
  refusals.value = []

  try {
    const answer = await $fetch<{ id: string, status: string, occurrences: unknown[] }>('/api/rooms/series', {
      method: 'POST',
      body: {
        roomId: state.roomId,
        title: state.title,
        attendees: state.attendees ?? null,
        tier: state.tier,
        purpose: state.purpose,
        ...recurrence.value,
      },
    })

    toast.add({
      title: answer.status === 'CONFIRMED'
        ? `${plural(answer.occurrences.length, 'booking')} made`
        : `${plural(answer.occurrences.length, 'booking')} asked for`,
      description: answer.status === 'CONFIRMED'
        ? 'Cancelling asks whether you mean one week or the whole run.'
        : 'The slots are held while somebody decides.',
      icon: 'i-lucide-check',
      color: answer.status === 'CONFIRMED' ? 'success' : 'warning',
    })
    await navigateTo('/rooms/mine')
  }
  catch (error) {
    const data = refusalData<{ refusals?: typeof refusals.value }>(error)
    refusals.value = data?.refusals ?? []
    if (refusals.value.length === 0) toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// Resubmitted without the weeks that failed, which keeps every other week where it was.
async function bookWithoutRefused(): Promise<void> {
  const skip = refusals.value.map(one => one.day)
  saving.value = true
  try {
    const answer = await $fetch<{ occurrences: unknown[] }>('/api/rooms/series', {
      method: 'POST',
      body: {
        roomId: state.roomId,
        title: state.title,
        attendees: state.attendees ?? null,
        tier: state.tier,
        ...recurrence.value,
        skip,
      },
    })
    toast.add({
      title: `${plural(answer.occurrences.length, 'booking')} made`,
      description: `${plural(skip.length, 'week')} left out.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await navigateTo('/rooms/mine')
  }
  catch (error) {
    const data = refusalData<{ refusals?: typeof refusals.value }>(error)
    refusals.value = data?.refusals ?? []
    if (refusals.value.length === 0) toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

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

// The room cannot hold more than it holds, so the field will not go above it. The write path
// still only warns, which is what C-101 criterion 5 asks for: this guides rather than refuses.
const capacity = computed(() => room.value?.capacity ?? undefined)
const tooMany = computed(() => overCapacity(room.value?.capacity ?? null, state.attendees ?? null))

// Said before submitting, not after: a room somebody else books, or one that always asks, is
// worth knowing about while the form is still being filled in (C-105 criterion 5).
const warnsUpFront = computed(() => {
  if (standing.value.standing === 'PRE_APPROVAL') return standing.value.says
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
        purpose: event.data.purpose,
      },
    })

    toast.add({
      title: 'Booked',
      description: answer.warning ?? undefined,
      icon: 'i-lucide-check',
      color: answer.warning ? 'warning' : 'success',
    })
    await navigateTo('/rooms')
  }
  catch (error) {
    const data = refusalData<{ failures?: Failure[], canRequest?: boolean, conflicts?: unknown[] }>(error)
    failures.value = data?.failures ?? []
    askInstead.value = data?.canRequest ?? false
    if (failures.value.length === 0 && !askInstead.value) toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// The same span, asked for rather than taken. It holds the slot while somebody decides, so the
// member is not racing anybody for it while they wait (C-108 criterion 2).
async function ask(): Promise<void> {
  saving.value = true
  try {
    await $fetch('/api/rooms/requests', {
      method: 'POST',
      body: {
        roomId: state.roomId,
        title: state.title,
        startsAt: instantOf(state.day, state.from),
        endsAt: instantOf(state.day, state.to),
        attendees: state.attendees ?? null,
        tier: state.tier,
        purpose: state.purpose,
        reason: reason.value,
      },
    })

    toast.add({
      title: 'Asked for',
      description: 'The slot is held while somebody decides.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    await navigateTo('/rooms/mine')
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
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
          :description="room?.capacity ? `The room holds ${room.capacity}.` : undefined"
          :help="tooMany ?? undefined"
        >
          <UInputNumber
            v-model="state.attendees"
            :min="1"
            :max="capacity"
            class="w-full"
            data-test="booking-attendees"
          />
        </UFormField>

        <UFormField
          label="What the room is for"
          name="purpose"
          required
          description="What you need the room to be like. It is what an SU room is judged suitable for."
        >
          <USelect
            v-model="state.purpose"
            :items="purposeOptions"
            value-key="value"
            placeholder="Choose what it is for"
            class="w-full"
            data-test="booking-purpose"
          />
        </UFormField>

        <UFormField
          label="Priority if the slot is contested"
          name="tier"
          description="An officer may change this. It decides who keeps the room, not what it is used for."
        >
          <USelect
            v-model="state.tier"
            :items="TIERS.map(tier => ({ label: tier.charAt(0) + tier.slice(1).toLowerCase(), value: tier }))"
            class="w-full"
            data-test="booking-tier"
          />
        </UFormField>

        <UCollapsible v-model:open="repeats">
          <UButton
            color="neutral"
            variant="ghost"
            class="w-full justify-between"
            :icon="repeats ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            data-test="repeat-toggle"
          >
            Repeat this booking
          </UButton>

          <template #content>
            <div class="mt-3 space-y-4 rounded-md border border-default p-4">
              <p class="text-sm text-muted">
                A term of rehearsals is booked as one series. Every date is checked before any of
                them is held, so a week somebody else has stops the whole run rather than leaving
                you with half of it.
              </p>

              <UFormField label="How often">
                <USelect
                  v-model="frequency"
                  :items="[{ label: 'Every week', value: 'WEEKLY' }, { label: 'Every day', value: 'DAILY' }]"
                  value-key="value"
                  class="w-full"
                  data-test="repeat-frequency"
                />
              </UFormField>

              <UFormField
                v-if="frequency === 'WEEKLY'"
                label="On which days"
                required
              >
                <div class="flex flex-wrap gap-1">
                  <UButton
                    v-for="weekday in WEEKDAYS"
                    :key="weekday.value"
                    size="sm"
                    :color="weekdays.includes(weekday.value) ? 'primary' : 'neutral'"
                    :variant="weekdays.includes(weekday.value) ? 'solid' : 'outline'"
                    :aria-pressed="weekdays.includes(weekday.value)"
                    :data-test="`repeat-day-${weekday.value}`"
                    @click="weekdays = weekdays.includes(weekday.value)
                      ? weekdays.filter(one => one !== weekday.value)
                      : [...weekdays, weekday.value]"
                  >
                    {{ weekday.label }}
                  </UButton>
                </div>
              </UFormField>

              <UFormField
                label="How many times"
                :description="`Up to ${seriesCap}.`"
              >
                <UInputNumber
                  v-model="occurrences"
                  :min="1"
                  :max="seriesCap"
                  class="w-full"
                  data-test="repeat-count"
                />
              </UFormField>

              <p
                v-if="seriesReady"
                class="text-sm"
                data-test="repeat-summary"
              >
                {{ saysRecurrence(recurrence) }}, from {{ state.from }} to {{ state.to }}.
              </p>
            </div>
          </template>
        </UCollapsible>

        <UAlert
          v-if="refusals.length"
          color="warning"
          variant="subtle"
          title="Some of those dates cannot be booked"
          data-test="series-refusals"
        >
          <template #description>
            <p>Nothing has been booked. Leave these out and the rest go ahead.</p>
            <ul class="mt-1 list-disc ps-4">
              <li
                v-for="refusal in refusals"
                :key="refusal.day"
              >
                {{ refusal.day }}:
                {{ refusal.conflicts.length ? 'somebody already has it' : refusal.failures.map(one => one.says).join(' ') }}
              </li>
            </ul>
            <UButton
              class="mt-3"
              size="sm"
              :loading="saving"
              data-test="series-without-refused"
              @click="bookWithoutRefused"
            >
              Book the other {{ plural(occurrences - refusals.length, 'date') }}
            </UButton>
          </template>
        </UAlert>

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
              Ask for it anyway, and somebody will decide. The slot is held while they do.
            </p>
          </template>
        </UAlert>

        <UFormField
          v-if="askInstead"
          label="Why this one is worth an exception"
          name="reason"
          required
          :description="`Shown to whoever decides. Up to ${REQUEST_REASON_LIMIT} characters.`"
        >
          <UTextarea
            v-model="reason"
            :rows="3"
            :maxlength="REQUEST_REASON_LIMIT"
            class="w-full"
            data-test="request-reason"
          />
        </UFormField>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="askInstead"
            :loading="saving"
            :disabled="!reason.trim() || !state.purpose"
            data-test="request-submit"
            @click="ask"
          >
            Ask for it
          </UButton>
          <UButton
            v-else-if="repeats"
            :loading="saving"
            :disabled="!seriesReady"
            data-test="series-submit"
            @click="bookSeries"
          >
            Book {{ plural(occurrences, 'date') }}
          </UButton>
          <UButton
            v-else
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
