<script setup lang="ts">
import { TIERS, describePurpose } from '#shared/utils/bookings'
import { FREQUENCIES, saysRecurrence } from '#shared/utils/series'
import { overCapacity } from '#shared/utils/rooms'
import { REQUEST_REASON_LIMIT } from '#shared/utils/requests'
import { fromLondonWallClock, londonWeekday } from '#shared/utils/london'
import { saysDayLong } from '#shared/utils/when'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { RoomHours } from '#shared/utils/rooms'
import { z } from 'zod'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/my-nnt/book-a-room' })

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
const fields = z.object({
  roomId: z.string().min(1, 'Choose a room'),
  title: z.string().trim().min(1, 'Say what the booking is for').max(200),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a day'),
  from: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a start time'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'Choose an end time'),
  attendees: z.number().int().positive().nullish(),
  tier: z.enum(TIERS),
  purpose: z.string().min(1, 'Say what the room is for'),
  repeats: z.boolean(),
  frequency: z.enum(FREQUENCIES),
  weekdays: z.array(z.number().int()),
  occurrences: z.number().int().positive(),
  asking: z.boolean(),
  reason: z.string().trim().max(REQUEST_REASON_LIMIT),
})

type BookingForm = z.output<typeof fields>

const state = reactive<BookingForm>({
  roomId: String(route.query.room ?? ''),
  title: '',
  day: String(route.query.day ?? ''),
  from: String(route.query.at ?? '10:00'),
  // A drag across the calendar arrives with both ends; a single click brings one and an hour.
  to: String(route.query.until ?? addMinutes(String(route.query.at ?? '10:00'), 60)),
  attendees: undefined,
  tier: 'GENERAL',
  // Never defaulted, but taken from the link: a QR code an officer made says what the room is for,
  // and a value nobody chose is the failure the notes exist to remove (C-119).
  purpose: String(route.query.purpose ?? ''),
  // A term of rehearsals is one action, so repeating is part of this form rather than a screen of
  // its own (C-110). Off by default: most bookings are one evening.
  repeats: false,
  frequency: 'WEEKLY',
  weekdays: [],
  occurrences: 4,
  asking: false,
  reason: '',
})

const saving = ref(false)
const failures = ref<Failure[]>([])
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

// One schema for all three submits (C-105 criterion 8): what a series or a request needs on top is
// asked for only when that is what the member is sending.
const form = computed(() => fields
  .refine(booking => booking.to > booking.from, { path: ['to'], message: 'A booking ends after it starts' })
  .superRefine((booking, context) => {
    if (booking.asking && booking.reason.length === 0) {
      context.addIssue({ code: 'custom', path: ['reason'], message: 'Say why this one is worth an exception' })
    }
    if (booking.repeats && booking.frequency === 'WEEKLY' && booking.weekdays.length === 0) {
      context.addIssue({ code: 'custom', path: ['weekdays'], message: 'Choose at least one day' })
    }
    if (booking.repeats && booking.occurrences > seriesCap.value) {
      context.addIssue({ code: 'custom', path: ['occurrences'], message: `Up to ${seriesCap.value}` })
    }
  }))

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
  if (!day || state.weekdays.length > 0) return
  const [year, month, date] = day.split('-').map(Number)
  state.weekdays = [londonWeekday(fromLondonWallClock(year!, month!, date!, 12))]
}, { immediate: true })

const recurrence = computed(() => ({
  frequency: state.frequency,
  weekdays: state.weekdays,
  startsOn: state.day,
  from: state.from,
  to: state.to,
  occurrences: state.occurrences,
}))

// One body for the first submit and the resubmit without the refused weeks, so the two can never
// disagree about what a series carries (issue 1143).
function seriesBody(skip: string[]): Record<string, unknown> {
  return {
    roomId: state.roomId,
    title: state.title,
    attendees: state.attendees ?? null,
    tier: state.tier,
    purpose: state.purpose,
    ...recurrence.value,
    skip,
  }
}

async function bookSeries(): Promise<void> {
  saving.value = true
  failures.value = []
  refusals.value = []

  try {
    const answer = await $fetch<{ id: string, status: string, occurrences: unknown[] }>('/api/rooms/series', {
      method: 'POST',
      body: seriesBody([]),
    })

    toast.add({
      title: answer.status === 'CONFIRMED'
        ? `${plural(answer.occurrences.length, 'booking')} made`
        : `${plural(answer.occurrences.length, 'booking')} asked for`,
      description: answer.status === 'CONFIRMED'
        ? `${made()}. Cancelling asks whether you mean one week or the whole run.`
        : `${made()}. The slots are held while an officer decides.`,
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
      body: seriesBody(skip),
    })
    toast.add({
      title: `${plural(answer.occurrences.length, 'booking')} made`,
      description: `${made()}. ${plural(skip.length, 'week')} left out.`,
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

// What was just made, said on the screen it lands on (C-105 criterion 7).
function made(): string {
  return `${room.value?.name ?? 'The room'}, ${saysDayLong(state.day)} from ${state.from} to ${state.to}`
}

function today(): string {
  return londonDay(new Date())
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

// The server refuses NO_MEMBERSHIP outright (0031), so the form's job is to say where to put it
// right rather than to invent its own wording (A-129).
const needsMembership = computed(() => failures.value.some(failure => failure.reason === 'NO_MEMBERSHIP'))

const seriesReady = computed(() =>
  Boolean(state.roomId && state.title.trim() && state.day && state.purpose)
  && (state.frequency === 'DAILY' || state.weekdays.length > 0))

// Said before submitting, not after: a room somebody else books, or one that always asks, is
// worth knowing about while the form is still being filled in (C-105 criterion 5).
const warnsUpFront = computed(() => {
  if (standing.value.standing === 'PRE_APPROVAL') return standing.value.says
  if (room.value?.sensitive) return 'Every booking for this room is agreed by a person before it is held.'
  return null
})

// Everything the form can send goes through the form (C-105 criterion 8): a series and a request
// are the same fields with more asked of them, never a second path round the schema.
async function submit(event: FormSubmitEvent<BookingForm>): Promise<void> {
  if (state.asking) return ask()
  if (state.repeats) return bookSeries()
  return book(event)
}

async function book(event: FormSubmitEvent<BookingForm>): Promise<void> {
  saving.value = true
  failures.value = []

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
      description: answer.warning ? `${made()}. ${answer.warning}` : made(),
      icon: 'i-lucide-check',
      color: answer.warning ? 'warning' : 'success',
    })
    await navigateTo('/rooms/mine')
  }
  catch (error) {
    const data = refusalData<{ failures?: Failure[], canRequest?: boolean, conflicts?: unknown[] }>(error)
    failures.value = data?.failures ?? []
    state.asking = data?.canRequest ?? false
    if (failures.value.length === 0 && !state.asking) toast.add({ title: refusalText(error), color: 'error' })
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
        reason: state.reason,
      },
    })

    toast.add({
      title: 'Asked for',
      description: `${made()}. The slot is held while an officer decides.`,
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
  <UContainer :class="MEMBER_PAGE_WORKING">
    <UPageHeader
      title="Book a room"
      description="A booking inside the rules is held straight away. One outside them is a request an officer decides on."
    />

    <UPageCard class="mt-8">
      <UForm
        :schema="form"
        :state="state"
        class="space-y-5"
        data-test="booking-form"
        @submit="submit"
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
            <TimeField
              v-model="state.from"
              class="w-full"
              data-test="booking-from"
            />
          </UFormField>

          <UFormField
            label="Until"
            name="to"
            required
          >
            <TimeField
              v-model="state.to"
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
          description="What you need the room to be like. It is what a room we do not manage is judged suitable for."
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

        <UCollapsible v-model:open="state.repeats">
          <UButton
            color="neutral"
            variant="ghost"
            class="w-full justify-between"
            :icon="state.repeats ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
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

              <UFormField
                label="How often"
                name="frequency"
              >
                <USelect
                  v-model="state.frequency"
                  :items="[{ label: 'Every week', value: 'WEEKLY' }, { label: 'Every day', value: 'DAILY' }]"
                  value-key="value"
                  class="w-full"
                  data-test="repeat-frequency"
                />
              </UFormField>

              <UFormField
                v-if="state.frequency === 'WEEKLY'"
                label="On which days"
                name="weekdays"
                required
              >
                <div class="flex flex-wrap gap-1">
                  <UButton
                    v-for="weekday in WEEKDAYS"
                    :key="weekday.value"
                    size="sm"
                    :color="state.weekdays.includes(weekday.value) ? 'primary' : 'neutral'"
                    :variant="state.weekdays.includes(weekday.value) ? 'solid' : 'outline'"
                    :aria-pressed="state.weekdays.includes(weekday.value)"
                    :icon="state.weekdays.includes(weekday.value) ? 'i-lucide-check' : undefined"
                    :data-test="`repeat-day-${weekday.value}`"
                    @click="state.weekdays = state.weekdays.includes(weekday.value)
                      ? state.weekdays.filter(one => one !== weekday.value)
                      : [...state.weekdays, weekday.value]"
                  >
                    {{ weekday.label }}
                  </UButton>
                </div>
              </UFormField>

              <UFormField
                label="How many times"
                name="occurrences"
                :description="`Up to ${seriesCap}.`"
              >
                <UInputNumber
                  v-model="state.occurrences"
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
                {{ refusal.conflicts.length ? 'another member already has it' : refusal.failures.map(one => one.says).join(' ') }}
              </li>
            </ul>
            <UButton
              class="mt-3"
              size="sm"
              :loading="saving"
              data-test="series-without-refused"
              @click="bookWithoutRefused"
            >
              Book the other {{ plural(state.occurrences - refusals.length, 'date') }}
            </UButton>
          </template>
        </UAlert>

        <UAlert
          v-if="failures.length"
          :color="state.asking ? 'warning' : 'error'"
          variant="subtle"
          :title="state.asking ? 'This one needs an officer to agree to it' : 'That booking cannot be made'"
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
              v-if="state.asking"
              class="mt-2"
            >
              Ask for it anyway, and an officer will decide. The slot is held while they do.
            </p>
            <UButton
              v-if="needsMembership"
              class="mt-2"
              size="sm"
              variant="subtle"
              to="/account/membership"
              data-test="booking-membership-link"
            >
              Tell us about your membership
            </UButton>
          </template>
        </UAlert>

        <UFormField
          v-if="state.asking"
          label="Why this one is worth an exception"
          name="reason"
          required
          :description="`Shown to whoever decides. Up to ${REQUEST_REASON_LIMIT} characters.`"
        >
          <UTextarea
            v-model="state.reason"
            :rows="3"
            :maxlength="REQUEST_REASON_LIMIT"
            class="w-full"
            data-test="request-reason"
          />
        </UFormField>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="state.asking"
            type="submit"
            :loading="saving"
            data-test="request-submit"
          >
            Ask for it
          </UButton>
          <UButton
            v-else-if="state.repeats"
            type="submit"
            :loading="saving"
            :disabled="!seriesReady"
            data-test="series-submit"
          >
            Book {{ plural(state.occurrences, 'date') }}
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
