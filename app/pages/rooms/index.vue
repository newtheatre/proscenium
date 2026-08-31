<script setup lang="ts">
import { formatLondon, fromLondonWallClock, londonWeekday } from '#shared/utils/london'
import type { RoomHours } from '#shared/utils/rooms'

definePageMeta({ middleware: 'signed-in' })

interface Taken {
  startsAt: number
  endsAt: number
  title: string
  bookedBy?: string
  status: string
  mine: boolean
}

interface Room {
  id: string
  name: string
  capacity: number | null
  sensitive: boolean
  isExternal: boolean
  hours: RoomHours[]
  taken: Taken[]
}

interface Availability { from: string, to: string, rooms: Room[] }

// The grid is quarter hours, the smallest slot the shortest permitted booking divides into.
const DAY_STARTS = 8
const DAY_ENDS = 24
const SLOT_MINUTES = 15

const request = useRequestFetch()

// Day below tablet width, week above: a foyer is not a desk (C-102 criterion 5). False while
// rendering, a server having no viewport, and corrected on the first client tick.
const narrow = useMediaQuery('(max-width: 767px)')
const view = ref<'day' | 'week'>('week')
const shown = computed<'day' | 'week'>(() => (narrow.value ? 'day' : view.value))

const anchor = ref(todayInLondon())

// A Select item may not carry an empty string: Reka reserves it for clearing the selection, and
// an item that uses one throws on hydration. The audit trail carries the same sentinel.
const EVERY_ROOM = 'all'
const roomId = ref(EVERY_ROOM)

function todayInLondon(): string {
  return formatLondon(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-')
}

// Midday, so which London day a date names cannot be moved by a clock change.
function noonOn(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return fromLondonWallClock(year!, month!, date!, 12)
}

function addDays(day: string, count: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, date! + count)).toISOString().slice(0, 10)
}

// Monday to Sunday, which is how a rehearsal week reads.
const span = computed(() => {
  if (shown.value === 'day') return { from: anchor.value, to: anchor.value }
  const weekday = londonWeekday(noonOn(anchor.value))
  const monday = addDays(anchor.value, weekday === 0 ? -6 : 1 - weekday)
  return { from: monday, to: addDays(monday, 6) }
})

// Only the visible span is ever asked for. The old app fetched every page of every booking to the
// browser, and that defect must not recur (C-102 criterion 3).
const { data, status, refresh } = await useAsyncData(
  () => `availability-${span.value.from}-${span.value.to}-${roomId.value}`,
  () => request<Availability>('/api/rooms/availability', {
    query: {
      from: span.value.from,
      to: span.value.to,
      ...(roomId.value === EVERY_ROOM ? {} : { roomId: roomId.value }),
    },
  }),
  { watch: [span, roomId], default: (): Availability => ({ from: '', to: '', rooms: [] }) },
)

const days = computed(() =>
  Array.from({ length: shown.value === 'day' ? 1 : 7 }, (_, index) => addDays(span.value.from, index)))

const roomOptions = computed(() => [
  { label: 'Every room', value: EVERY_ROOM },
  ...data.value.rooms.map(room => ({ label: room.name, value: room.id })),
])

const slots = computed(() =>
  Array.from({ length: ((DAY_ENDS - DAY_STARTS) * 60) / SLOT_MINUTES }, (_, index) => {
    const minutes = DAY_STARTS * 60 + index * SLOT_MINUTES
    return { minutes, label: clockAt(minutes) }
  }))

function clockAt(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

// London wall clock to the instant it names. Never `new Date('...T09:00')`, which a server reads
// as UTC and a browser as whatever the machine happens to be set to.
function instantOf(day: string, minutes: number): number {
  const [year, month, date] = day.split('-').map(Number)
  return Math.floor(fromLondonWallClock(year!, month!, date!, Math.floor(minutes / 60), minutes % 60).getTime() / 1000)
}

function bookingAt(room: Room, day: string, minutes: number): Taken | undefined {
  const at = instantOf(day, minutes)
  return room.taken.find(taken => taken.startsAt <= at && taken.endsAt > at)
}

function openOn(room: Room, day: string, minutes: number): boolean {
  if (room.hours.length === 0) return true
  const weekday = londonWeekday(noonOn(day))
  const clock = clockAt(minutes)
  return room.hours.some(hours => hours.weekday === weekday && clock >= hours.opens && clock < hours.closes)
}

function labelFor(day: string): string {
  return formatLondon(noonOn(day), { weekday: 'short', day: 'numeric', month: 'short' })
}

type SlotState = 'closed' | 'booked' | 'pending' | 'free'

function stateOf(room: Room, day: string, minutes: number): SlotState {
  if (!openOn(room, day, minutes)) return 'closed'
  const taken = bookingAt(room, day, minutes)
  if (!taken) return 'free'
  return taken.status === 'PENDING_APPROVAL' ? 'pending' : 'booked'
}

// Colour is never the only carrier: every slot names its state to a screen reader (K-101).
const SAYS: Record<SlotState, string> = {
  closed: 'closed',
  booked: 'booked',
  pending: 'awaiting a decision',
  free: 'free',
}

const FILLS: Record<SlotState, string> = {
  closed: 'bg-muted cursor-not-allowed',
  booked: 'bg-primary/30 cursor-not-allowed',
  pending: 'bg-warning/30 cursor-not-allowed',
  free: 'bg-default hover:bg-elevated',
}

function move(by: number): void {
  anchor.value = addDays(anchor.value, shown.value === 'day' ? by : by * 7)
}

useSeoMeta({ title: 'Rooms' })
</script>

<template>
  <UContainer class="py-8">
    <UPageHeader
      title="Rooms"
      description="What is free, and when. A slot somebody else holds reads as booked and nothing more."
    />

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <UButtonGroup>
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="outline"
          aria-label="Earlier"
          data-test="calendar-back"
          @click="move(-1)"
        />
        <UButton
          color="neutral"
          variant="outline"
          data-test="calendar-today"
          @click="anchor = todayInLondon()"
        >
          Today
        </UButton>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="outline"
          aria-label="Later"
          data-test="calendar-forward"
          @click="move(1)"
        />
      </UButtonGroup>

      <USelect
        v-model="roomId"
        :items="roomOptions"
        class="w-52"
        data-test="calendar-room"
      />

      <UButtonGroup v-if="!narrow">
        <UButton
          :color="view === 'day' ? 'primary' : 'neutral'"
          variant="outline"
          data-test="calendar-day"
          @click="view = 'day'"
        >
          Day
        </UButton>
        <UButton
          :color="view === 'week' ? 'primary' : 'neutral'"
          variant="outline"
          data-test="calendar-week"
          @click="view = 'week'"
        >
          Week
        </UButton>
      </UButtonGroup>

      <UIcon
        v-if="status === 'pending'"
        name="i-lucide-loader-circle"
        class="animate-spin text-muted"
      />

      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        aria-label="Refresh"
        @click="refresh()"
      />
    </div>

    <p
      class="mt-3 text-sm text-muted"
      data-test="calendar-span"
    >
      {{ labelFor(span.from) }}<span v-if="span.from !== span.to"> to {{ labelFor(span.to) }}</span>
    </p>

    <p
      v-if="data.rooms.length === 0"
      class="mt-8 text-sm text-muted"
    >
      No rooms are bookable yet.
    </p>

    <section
      v-for="room in data.rooms"
      :key="room.id"
      class="mt-8"
      data-test="calendar-room-block"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="nnt-headline text-lg">
          {{ room.name }}
        </h2>
        <UBadge
          v-if="room.isExternal"
          color="info"
          variant="subtle"
          size="sm"
        >
          Booked through the SU
        </UBadge>
        <UBadge
          v-else-if="room.sensitive"
          color="warning"
          variant="subtle"
          size="sm"
        >
          Needs approval
        </UBadge>
        <span
          v-if="room.capacity"
          class="text-sm text-muted"
        >Holds {{ room.capacity }}</span>
      </div>

      <div class="mt-3 overflow-x-auto">
        <div
          class="grid min-w-[36rem] gap-px rounded-md bg-accented"
          :style="{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(4.5rem, 1fr))` }"
        >
          <div class="bg-default p-2 text-xs text-muted">
            Time
          </div>
          <div
            v-for="day in days"
            :key="day"
            class="bg-default p-2 text-center text-xs font-medium"
          >
            {{ labelFor(day) }}
          </div>

          <template
            v-for="slot in slots"
            :key="slot.minutes"
          >
            <div class="bg-default px-2 py-1 text-right text-xs text-muted">
              <span v-if="slot.minutes % 60 === 0">{{ slot.label }}</span>
            </div>
            <button
              v-for="day in days"
              :key="`${day}-${slot.minutes}`"
              type="button"
              class="h-4 w-full"
              :class="FILLS[stateOf(room, day, slot.minutes)]"
              :disabled="stateOf(room, day, slot.minutes) !== 'free'"
              :aria-label="`${room.name}, ${labelFor(day)} at ${slot.label}: ${SAYS[stateOf(room, day, slot.minutes)]}`"
              :data-test="`slot-${room.id}-${day}-${slot.label}`"
              @click="navigateTo({ path: '/rooms/book', query: { room: room.id, day, at: slot.label } })"
            />
          </template>
        </div>
      </div>
    </section>

    <div class="mt-8 flex flex-wrap items-center gap-4 text-sm text-muted">
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-default ring-1 ring-accented" /> Free</span>
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-primary/30" /> Booked</span>
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-warning/30" /> Awaiting a decision</span>
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-muted" /> Closed</span>
    </div>
  </UContainer>
</template>
