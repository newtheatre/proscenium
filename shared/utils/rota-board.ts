import { z } from 'zod'
import { daysAfter, londonDayField } from './membership'
import { showNightBounds, showNightOf } from './show-night'

// The rota board's window (E-107 criterion 7). A window of show nights, not calendar days, so a
// performance running past midnight belongs to the evening it started (0014).

export const BOARD_WINDOW_NIGHTS = 14

// A cap, not a policy number: the board renders every card whole, so a window is bounded rather
// than paged (0003).
export const MAX_BOARD_WINDOW_NIGHTS = 366

export interface BoardWindow { from: string, to: string }
export interface BoardBounds { from: number, to: number }

// The coming fortnight, counted in nights from the one in progress.
export function defaultBoardWindow(at: Date): BoardWindow {
  const from = showNightOf(at)
  return { from, to: daysAfter(from, BOARD_WINDOW_NIGHTS - 1) }
}

// Unix seconds, `from` inclusive and `to` exclusive: the last night is held whole to its 04:00.
export function boardWindowBounds(window: BoardWindow): BoardBounds {
  return {
    from: Math.floor(showNightBounds(window.from).from.getTime() / 1000),
    to: Math.floor(showNightBounds(window.to).to.getTime() / 1000),
  }
}

// Both ends default, so a bare read of the board opens on the coming fortnight.
export const boardWindowQuery = z.object({
  from: londonDayField.default(() => defaultBoardWindow(new Date()).from),
  to: londonDayField.default(() => defaultBoardWindow(new Date()).to),
})
  .refine(window => window.from <= window.to, { message: 'That window runs backwards', path: ['to'] })
  .refine(window => daysAfter(window.from, MAX_BOARD_WINDOW_NIGHTS) > window.to,
    { message: 'Choose a shorter span', path: ['to'] })

export type BoardEntry<P, O> = ({ kind: 'performance' } & P) | ({ kind: 'opening' } & O)

// Bar openings sit among the performances by when they start; on a tie the performance leads,
// since the house is the evening's main event (E-130 criterion 8).
export function boardEntries<P extends { startsAt: number }, O extends { startsAt: number }>(
  performances: readonly P[],
  openings: readonly O[],
): BoardEntry<P, O>[] {
  const entries: BoardEntry<P, O>[] = [
    ...performances.map(performance => ({ kind: 'performance' as const, ...performance })),
    ...openings.map(opening => ({ kind: 'opening' as const, ...opening })),
  ]
  const rank = (entry: BoardEntry<P, O>): number => entry.kind === 'performance' ? 0 : 1
  return entries.sort((a, b) => a.startsAt - b.startsAt || rank(a) - rank(b))
}

export interface Staffing {
  says: string
  tone: 'success' | 'warning' | 'neutral'
  empty: boolean
}

// Nought of nought is nobody rostered, never "Fully staffed"; an external night is rostered ad hoc,
// so none there is a fact rather than a gap (issue 1319, E-101 criterion 5).
export function saysStaffing(entry: { shifts: { status: string }[], isExternal?: boolean }): Staffing {
  if (entry.shifts.length === 0) {
    return entry.isExternal
      ? { says: 'Not rostered', tone: 'neutral', empty: true }
      : { says: 'No shifts: nobody is rostered', tone: 'warning', empty: true }
  }
  return entry.shifts.every(shift => shift.status === 'CONFIRMED')
    ? { says: 'Fully staffed', tone: 'success', empty: false }
    : { says: 'Needs people', tone: 'warning', empty: false }
}

// A bare day is read as "is" by the openings list's night filter, so the link lands on that night.
export function openingsOnNightHref(night: string): string {
  return `/rota/manage/openings?night=${night}`
}
