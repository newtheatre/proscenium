// The week grid's arithmetic (spec part 5, "How the grid reads"), shared by its screens: rows on the
// grid step, the level under a cell, and dates moved by whole days.
import type { ShownLevel } from './levels'

export const DAY_MINUTES = 1440 // not-policy: minutes in a day

export interface Piece { start: number, end: number, level: ShownLevel, reason?: string }
export interface Day { date: string, pieces: Piece[] }

/** "HH:MM" for minutes past midnight, "24:00" at the end of the day. */
export function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` // not-policy: minutes in an hour
}

/** The start of each row, in minutes past midnight. */
export const rowStarts = (step: number) => Array.from({ length: Math.ceil(DAY_MINUTES / step) }, (_, i) => i * step)

/** The piece a cell starting at `minute` falls in. */
export const pieceAt = (pieces: Piece[], minute: number): Piece | undefined => pieces.find(p => p.start <= minute && minute < p.end)

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10) // not-policy: midday, clear of any zone's edge
}

/** The Monday of the week a date is in. */
export const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7)) // not-policy: weeks from Monday
