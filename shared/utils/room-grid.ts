import { fromLondonWallClock } from './london'
import { saysClock, saysDay } from './when'

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
