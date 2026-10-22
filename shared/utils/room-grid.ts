import { fromLondonWallClock, londonParts, londonWeekday } from './london'
import { saysClock, saysDay } from './when'
import type { RoomHours } from './rooms'

// What the room calendar's grid decides about a slot, kept pure so the click, the past and the
// closures are judged the same way in a test as on the screen (C-102).

export interface GridSpan { from: number, to: number }

export interface GridShut { startsAt: number, endsAt: number, reason: string }

// The span a click picks, in minutes into the day: an hour from the slot pressed, as the calendar
// promises, cut short at the first slot that is not free and at midnight.
export function clickSpan(at: number, slotMinutes: number, free: (minutes: number) => boolean, lengthMinutes = 60): GridSpan {
  let to = at + slotMinutes
  while (to < at + lengthMinutes && to < 24 * 60 && free(to)) to += slotMinutes
  return { from: at, to }
}

// A London wall clock on a day, as epoch seconds. Never `new Date('...T09:00')`, which a server
// reads as UTC and a browser as whatever the machine is set to.
export function slotInstant(day: string, minutes: number): number {
  const [year, month, date] = day.split('-').map(Number)
  return Math.floor(fromLondonWallClock(year!, month!, date!, Math.floor(minutes / 60), minutes % 60).getTime() / 1000)
}

// A slot whose end has gone can hold nothing, so it is never offered: the write path refuses a
// booking wholly in the past (C-105 criterion 6), and the grid says so before the click.
export function slotPassed(day: string, minutes: number, slotMinutes: number, now: number): boolean {
  return slotInstant(day, minutes + slotMinutes) <= now
}

// How much of a span the closures cover, so a summary cell never calls a closed evening free.
export function closureCover(closures: readonly GridShut[], from: number, to: number): 'none' | 'part' | 'all' {
  const inside = closures
    .filter(closure => closure.startsAt < to && closure.endsAt > from)
    .map(closure => ({ startsAt: Math.max(closure.startsAt, from), endsAt: Math.min(closure.endsAt, to) }))
    .sort((one, other) => one.startsAt - other.startsAt)
  if (inside.length === 0) return 'none'

  let reached = from
  for (const closure of inside) {
    if (closure.startsAt > reached) return 'part'
    reached = Math.max(reached, closure.endsAt)
  }
  return reached >= to ? 'all' : 'part'
}

// A closure in words, naming the day at each end, because one that runs past midnight would
// otherwise read as happening on the day being looked at.
export function saysRoomClosure(room: string, closure: GridShut): string {
  const starts = `${saysDay(closure.startsAt)} ${saysClock(closure.startsAt)}`
  const sameDay = saysDay(closure.startsAt) === saysDay(closure.endsAt)
  const ends = sameDay ? saysClock(closure.endsAt) : `${saysDay(closure.endsAt)} ${saysClock(closure.endsAt)}`
  return `${room}, closed ${starts} to ${ends}: ${closure.reason}`
}

export interface GridHeld { startsAt: number, endsAt: number, status: string, mine: boolean }

export interface GridPlace { hours: readonly RoomHours[], taken: readonly GridHeld[], closed?: readonly GridShut[] }

export type SlotState = 'past' | 'closed' | 'blacked-out' | 'mine' | 'booked' | 'pending' | 'free'

function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return londonWeekday(fromLondonWallClock(year!, month!, date!, 12))
}

function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function openAt(hours: readonly RoomHours[], day: string, minutes: number): boolean {
  if (hours.length === 0) return true
  const weekday = weekdayOf(day)
  const clock = clockOf(minutes)
  return hours.some(open => open.weekday === weekday && clock >= open.opens && clock < open.closes)
}

// A closure outranks a booking, which outranks the opening hours: an exception an officer agreed
// outside them is still held, and a slot drawn "not open" over it would read as empty.
export function slotState(place: GridPlace, day: string, minutes: number, slotMinutes: number, now: number): SlotState {
  const at = slotInstant(day, minutes)
  if (place.closed?.some(closure => closure.startsAt <= at && closure.endsAt > at)) return 'blacked-out'
  const taken = place.taken.find(held => held.startsAt <= at && held.endsAt > at)
  if (taken) {
    if (taken.mine) return 'mine'
    return taken.status === 'PENDING_APPROVAL' ? 'pending' : 'booked'
  }
  if (!openAt(place.hours, day, minutes)) return 'closed'
  return slotPassed(day, minutes, slotMinutes, now) ? 'past' : 'free'
}

// The first hour the day view draws: the earliest any room shown opens, 06:00 for one that never
// shuts, and earlier still for a booking that starts before either. Never later than eight.
export const GRID_LATEST_FIRST_HOUR = 8
export const GRID_ALWAYS_OPEN_FIRST_HOUR = 6

export function gridFirstHour(places: readonly { place: GridPlace, day: string }[]): number {
  let first = GRID_LATEST_FIRST_HOUR
  for (const { place, day } of places) {
    const weekday = weekdayOf(day)
    if (place.hours.length === 0) first = Math.min(first, GRID_ALWAYS_OPEN_FIRST_HOUR)
    for (const open of place.hours) {
      if (open.weekday === weekday) first = Math.min(first, Number(open.opens.slice(0, 2)))
    }
    const from = slotInstant(day, 0)
    const to = slotInstant(day, 24 * 60)
    for (const held of place.taken) {
      if (held.startsAt >= from && held.startsAt < to) first = Math.min(first, londonParts(new Date(held.startsAt * 1000)).hour)
    }
  }
  return first
}

// What a screen reader hears for a slot: the room and the day once each, whatever the columns are.
export function saysSlot(room: string, day: string, minutes: number, what: string): string {
  return `${room}, ${saysDay(day, { year: false })} at ${clockOf(minutes)}: ${what}`
}
