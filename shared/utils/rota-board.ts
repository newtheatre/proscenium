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
