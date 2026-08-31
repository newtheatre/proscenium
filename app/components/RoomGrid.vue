<script setup lang="ts">
import { fromLondonWallClock, londonWeekday } from '#shared/utils/london'
import type { RoomHours } from '#shared/utils/rooms'

// One grid, two shapes. A column is a room on a day, so a week of one room and a day of every
// room are the same component with different columns (C-102 criterion 1).

export interface GridTaken {
  startsAt: number
  endsAt: number
  title: string
  status: string
  mine: boolean
}

export interface GridRoom {
  id: string
  name: string
  hours: RoomHours[]
  taken: GridTaken[]
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

const emit = defineEmits<{ pick: [column: GridColumn, clock: string] }>()

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

type SlotState = 'closed' | 'mine' | 'booked' | 'pending' | 'free'

function stateOf(column: GridColumn, minutes: number): SlotState {
  if (!openAt(column, minutes)) return 'closed'
  const taken = bookingAt(column, minutes)
  if (!taken) return 'free'
  if (taken.mine) return 'mine'
  return taken.status === 'PENDING_APPROVAL' ? 'pending' : 'booked'
}

// Colour is never the only carrier: every slot names its state to a screen reader (K-101).
const SAYS: Record<SlotState, string> = {
  closed: 'closed',
  mine: 'yours',
  booked: 'booked',
  pending: 'awaiting a decision',
  free: 'free',
}

const FILLS: Record<SlotState, string> = {
  closed: 'bg-muted cursor-not-allowed',
  mine: 'bg-secondary/40 cursor-not-allowed',
  booked: 'bg-primary/30 cursor-not-allowed',
  pending: 'bg-warning/30 cursor-not-allowed',
  free: 'bg-default hover:bg-elevated',
}

// A member's own booking is the one they may read, so it says what it is rather than "booked".
function labelOf(column: GridColumn, minutes: number): string {
  const state = stateOf(column, minutes)
  const taken = bookingAt(column, minutes)
  const what = state === 'mine' && taken ? `yours, ${taken.title}` : SAYS[state]
  return `${column.room.name}, ${column.label} at ${clockAt(minutes)}: ${what}`
}
</script>

<template>
  <div class="overflow-x-auto">
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
          :class="FILLS[stateOf(column, slot.minutes)]"
          :disabled="stateOf(column, slot.minutes) !== 'free'"
          :aria-label="labelOf(column, slot.minutes)"
          :data-test="`slot-${column.room.id}-${column.day}-${slot.label}`"
          @click="emit('pick', column, slot.label)"
        />
      </template>
    </div>
  </div>
</template>
