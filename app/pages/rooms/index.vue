<script setup lang="ts">
import { formatLondon, fromLondonWallClock, londonWeekday } from '#shared/utils/london'
import { closedOn } from '#shared/utils/rooms'
import type { GridColumn, GridRoom } from '~/components/RoomGrid.vue'

definePageMeta({ middleware: 'signed-in' })

interface Taken {
  startsAt: number
  endsAt: number
  title: string
  bookedBy?: string
  status: string
  mine: boolean
}

interface Room extends GridRoom {
  capacity: number | null
  sensitive: boolean
  isExternal: boolean
  taken: Taken[]
  closed: { startsAt: number, endsAt: number, reason: string }[]
}

interface Availability { from: string, to: string, rooms: Room[] }

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
const everyRoom = computed(() => roomId.value === EVERY_ROOM)

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
      ...(everyRoom.value ? {} : { roomId: roomId.value }),
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

function labelFor(day: string): string {
  return formatLondon(noonOn(day), { weekday: 'short', day: 'numeric', month: 'short' })
}

// The four shapes, from two questions. Across every room, the columns are rooms and the question
// is "what is free tonight"; within one room, they are days and it is "when is the studio free".
const columns = computed<GridColumn[]>(() => {
  if (shown.value === 'day') {
    return data.value.rooms.map(room => ({ key: room.id, label: room.name, room, day: anchor.value }))
  }
  const room = data.value.rooms[0]
  if (!room) return []
  return days.value.map(day => ({ key: day, label: labelFor(day), room, day }))
})

// A week across every room would be seven days by ten rooms of quarter hours, which nobody can
// read. It becomes a count per room per day, and a cell opens that room on that day.
const summary = computed(() => data.value.rooms.map(room => ({
  room,
  days: days.value.map(day => ({
    day,
    // A room shut that day is neither free nor busy, and saying "Free" invites a click that the
    // day view would then refuse.
    closed: closedOn(room.hours, londonWeekday(noonOn(day))),
    held: room.taken.filter(taken => taken.startsAt >= dayStart(day) && taken.startsAt < dayStart(addDays(day, 1))).length,
  })),
})))

function dayStart(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return Math.floor(fromLondonWallClock(year!, month!, date!).getTime() / 1000)
}

const weekOfEveryRoom = computed(() => shown.value === 'week' && everyRoom.value)

function move(by: number): void {
  anchor.value = addDays(anchor.value, shown.value === 'day' ? by : by * 7)
}

function book(column: GridColumn, from: string, until: string): void {
  navigateTo({ path: '/rooms/book', query: { room: column.room.id, day: column.day, at: from, until } })
}

function openDay(roomIdentity: string, day: string): void {
  roomId.value = roomIdentity
  anchor.value = day
  view.value = 'day'
}

useSeoMeta({ title: 'Rooms' })
</script>

<template>
  <UContainer class="py-8">
    <UPageHeader
      title="Rooms"
      description="What is free, and when. Click a free slot to book an hour, or drag across several. A slot somebody else holds reads as booked and nothing more."
    />

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <UFieldGroup>
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
      </UFieldGroup>

      <USelect
        v-model="roomId"
        :items="roomOptions"
        class="w-52"
        data-test="calendar-room"
      />

      <UFieldGroup v-if="!narrow">
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
      </UFieldGroup>

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
      No rooms are bookable yet. An officer adds them under Rooms in the admin screens.
    </p>

    <!-- Rooms down, days across, and a count in each: which room is quiet on Thursday. -->
    <div
      v-else-if="weekOfEveryRoom"
      class="mt-6 overflow-x-auto"
      data-test="calendar-summary"
    >
      <table class="w-full min-w-[40rem] text-sm">
        <thead>
          <tr>
            <th class="p-2 text-left font-medium">
              Room
            </th>
            <th
              v-for="day in days"
              :key="day"
              class="p-2 text-center font-medium"
            >
              {{ labelFor(day) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in summary"
            :key="row.room.id"
            class="border-t border-default"
          >
            <th class="p-2 text-left font-medium">
              {{ row.room.name }}
            </th>
            <td
              v-for="cell in row.days"
              :key="cell.day"
              class="p-1 text-center"
            >
              <span
                v-if="cell.closed"
                class="block py-1 text-xs text-muted"
                :data-test="`summary-${row.room.id}-${cell.day}`"
              >Closed</span>
              <UButton
                v-else
                size="xs"
                :color="cell.held ? 'primary' : 'neutral'"
                :variant="cell.held ? 'subtle' : 'ghost'"
                class="w-full justify-center"
                :aria-label="`${row.room.name}, ${labelFor(cell.day)}: ${cell.held ? plural(cell.held, 'booking') : 'nothing booked'}`"
                :data-test="`summary-${row.room.id}-${cell.day}`"
                @click="openDay(row.room.id, cell.day)"
              >
                {{ cell.held ? plural(cell.held, 'booking') : 'Free' }}
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <template v-else>
      <h2
        v-if="!everyRoom && data.rooms[0]"
        class="nnt-headline mt-6 text-lg"
      >
        {{ data.rooms[0].name }}
      </h2>

      <RoomGrid
        class="mt-3"
        :columns="columns"
        data-test="calendar-grid"
        @pick="book"
      />
    </template>

    <div class="mt-8 flex flex-wrap items-center gap-4 text-sm text-muted">
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-default ring-1 ring-accented" /> Free</span>
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-secondary/40" /> Yours</span>
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-primary/30" /> Booked</span>
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-warning/30" /> Awaiting a decision</span>
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-muted" /> Closed</span>
      <span class="flex items-center gap-2"><span class="size-3 rounded-sm bg-error/20" /> Shut</span>
    </div>
  </UContainer>
</template>
