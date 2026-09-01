<script setup lang="ts">
import { fromLondonWallClock, londonWeekday } from '#shared/utils/london'
import type { RoomHours } from '#shared/utils/rooms'

// One grid, two shapes. A column is a room on a day, so a week of one room and a day of every
// room are the same component with different columns (C-102 criterion 1). Dragging picks a span.

export interface GridTaken {
  startsAt: number
  endsAt: number
  title: string
  status: string
  mine: boolean
}

export interface GridClosure {
  startsAt: number
  endsAt: number
  reason: string
}

export interface GridRoom {
  id: string
  name: string
  hours: RoomHours[]
  taken: GridTaken[]
  closed?: GridClosure[]
}

export interface GridColumn {
  key: string
  label: string
  room: GridRoom
  day: string
}

const props = withDefaults(defineProps<{
  columns: GridColumn[]
  startsAt?: number
  endsAt?: number
  slotMinutes?: number
}>(), {
  startsAt: 8,
  endsAt: 24,
  slotMinutes: 15,
})

// From and until, so a drag across four slots books an hour rather than the default.
const emit = defineEmits<{ pick: [column: GridColumn, from: string, until: string] }>()

// A drag selects a span. It stays inside one column and stops at the first slot that is not free,
// so a selection can never straddle somebody else's booking.
const dragging = ref<{ key: string, from: number, to: number } | null>(null)

function startAt(column: GridColumn, minutes: number): void {
  if (stateOf(column, minutes) !== 'free') return
  dragging.value = { key: column.key, from: minutes, to: minutes }
}

function extendTo(column: GridColumn, minutes: number): void {
  const drag = dragging.value
  if (!drag || drag.key !== column.key) return

  // Every slot between the two ends has to be free, or the drag would book across a booking.
  const [low, high] = minutes < drag.from ? [minutes, drag.from] : [drag.from, minutes]
  for (let at = low; at <= high; at += props.slotMinutes) {
    if (stateOf(column, at) !== 'free') return
  }
  dragging.value = { ...drag, to: minutes }
}

function inDrag(column: GridColumn, minutes: number): boolean {
  const drag = dragging.value
  if (!drag || drag.key !== column.key) return false
  return minutes >= Math.min(drag.from, drag.to) && minutes <= Math.max(drag.from, drag.to)
}

// A pointer sequence ends in a click as well, and assistive technology and any programmatic
// caller send only the click. So click is the fallback, suppressed when a drag just answered.
const dragged = ref(false)

function pick(column: GridColumn, minutes: number): void {
  if (dragged.value) return
  emit('pick', column, clockAt(minutes), clockAt(minutes + props.slotMinutes * 4))
}

function finish(column: GridColumn): void {
  const drag = dragging.value
  dragging.value = null
  if (!drag || drag.key !== column.key) return

  dragged.value = true
  void nextTick(() => {
    dragged.value = false
  })

  const first = Math.min(drag.from, drag.to)
  // The end is the far edge of the last slot, so one slot is a whole slot rather than nothing.
  const last = Math.max(drag.from, drag.to) + props.slotMinutes
  emit('pick', column, clockAt(first), clockAt(Math.min(last, 24 * 60 - 1)))
}

const slots = computed(() =>
  Array.from({ length: ((props.endsAt - props.startsAt) * 60) / props.slotMinutes }, (_, index) => {
    const minutes = props.startsAt * 60 + index * props.slotMinutes
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

function bookingAt(column: GridColumn, minutes: number): GridTaken | undefined {
  const at = instantOf(column.day, minutes)
  return column.room.taken.find(taken => taken.startsAt <= at && taken.endsAt > at)
}

function openAt(column: GridColumn, minutes: number): boolean {
  if (column.room.hours.length === 0) return true
  const [year, month, date] = column.day.split('-').map(Number)
  const weekday = londonWeekday(fromLondonWallClock(year!, month!, date!, 12))
  const clock = clockAt(minutes)
  return column.room.hours.some(hours => hours.weekday === weekday && clock >= hours.opens && clock < hours.closes)
}

type SlotState = 'closed' | 'blacked-out' | 'mine' | 'booked' | 'pending' | 'free'

function closureAt(column: GridColumn, minutes: number): GridClosure | undefined {
  const at = instantOf(column.day, minutes)
  return column.room.closed?.find(closure => closure.startsAt <= at && closure.endsAt > at)
}

// A blackout outranks a booking: the room being shut is the reason it is unavailable, and saying
// "booked" instead would send somebody looking for whoever booked it (C-114 criterion 4).
function stateOf(column: GridColumn, minutes: number): SlotState {
  if (closureAt(column, minutes)) return 'blacked-out'
  if (!openAt(column, minutes)) return 'closed'
  const taken = bookingAt(column, minutes)
  if (!taken) return 'free'
  if (taken.mine) return 'mine'
  return taken.status === 'PENDING_APPROVAL' ? 'pending' : 'booked'
}

// Colour is never the only carrier: every slot names its state to a screen reader (K-101).
const SAYS: Record<SlotState, string> = {
  'blacked-out': 'shut',
  'closed': 'closed',
  'mine': 'yours',
  'booked': 'booked',
  'pending': 'awaiting a decision',
  'free': 'free',
}

const FILLS: Record<SlotState, string> = {
  'blacked-out': 'bg-error/20 cursor-not-allowed',
  'closed': 'bg-muted cursor-not-allowed',
  'mine': 'bg-secondary/40 cursor-not-allowed',
  'booked': 'bg-primary/30 cursor-not-allowed',
  'pending': 'bg-warning/30 cursor-not-allowed',
  'free': 'bg-default hover:bg-elevated',
}

// A member's own booking is the one they may read, so it says what it is rather than "booked".
// A blackout says its reason to everybody, which no booking does.
function labelOf(column: GridColumn, minutes: number): string {
  const state = stateOf(column, minutes)
  const taken = bookingAt(column, minutes)
  const closure = closureAt(column, minutes)

  const what = closure
    ? `shut, ${closure.reason}`
    : state === 'mine' && taken ? `yours, ${taken.title}` : SAYS[state]

  return `${column.room.name}, ${column.label} at ${clockAt(minutes)}: ${what}`
}
</script>

<template>
  <div
    class="overflow-x-auto"
    @pointerup="dragging = null"
    @pointerleave="dragging = null"
  >
    <div
      class="grid gap-px rounded-md bg-accented"
      :style="{
        minWidth: `${4 + columns.length * 4.5}rem`,
        gridTemplateColumns: `4rem repeat(${columns.length}, minmax(4.5rem, 1fr))`,
      }"
    >
      <div class="bg-default p-2 text-xs text-muted">
        Time
      </div>
      <div
        v-for="column in columns"
        :key="column.key"
        class="bg-default p-2 text-center text-xs font-medium"
      >
        {{ column.label }}
      </div>

      <template
        v-for="slot in slots"
        :key="slot.minutes"
      >
        <div class="bg-default px-2 py-1 text-right text-xs text-muted">
          <span v-if="slot.minutes % 60 === 0">{{ slot.label }}</span>
        </div>
        <button
          v-for="column in columns"
          :key="`${column.key}-${slot.minutes}`"
          type="button"
          class="h-4 w-full"
          :class="[FILLS[stateOf(column, slot.minutes)], inDrag(column, slot.minutes) ? 'ring-2 ring-inset ring-primary' : '']"
          :disabled="stateOf(column, slot.minutes) !== 'free'"
          :aria-label="labelOf(column, slot.minutes)"
          :title="closureAt(column, slot.minutes)?.reason"
          :data-test="`slot-${column.room.id}-${column.day}-${slot.label}`"
          @pointerdown.prevent="startAt(column, slot.minutes)"
          @pointerenter="extendTo(column, slot.minutes)"
          @pointerup="finish(column)"
          @click="pick(column, slot.minutes)"
        />
      </template>
    </div>
  </div>
</template>
