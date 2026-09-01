import { z } from 'zod'
import { DAY } from './series'

// Booked hours against open hours (C-117). The end-of-year review runs on numbers rather than
// impressions, which is what the old dashboard's counts never gave anybody (RM-3).

// A technical bound rather than a policy one, so it is a constant and not a setting (0012).
export const REPORT_PAGE_SIZE = 50
export const REPORT_EXPORT_LIMIT = 5000

export const BREAKDOWNS = ['room', 'tier'] as const
export type Breakdown = (typeof BREAKDOWNS)[number]

export interface UtilisationRow {
  key: string
  label: string
  confirmedHours: number
  cancelledHours: number
  noShowHours: number
  openHours: number
  bookings: number
}

// Nought open hours is not nought per cent used; it is a room nobody could book, which is a
// different fact and reads as such.
export function usedShare(row: { confirmedHours: number, openHours: number }): number | null {
  if (row.openHours <= 0) return null
  return Math.round((row.confirmedHours / row.openHours) * 1000) / 10
}

export function saysShare(row: { confirmedHours: number, openHours: number }): string {
  const share = usedShare(row)
  return share === null ? 'no opening hours recorded' : `${share}%`
}

export const reportQuery = z.object({
  from: z.string().regex(DAY, 'Choose a day to report from'),
  to: z.string().regex(DAY, 'Choose a day to report to'),
  by: z.enum(BREAKDOWNS).default('room'),
  page: z.coerce.number().int().positive().default(1),
}).refine(input => input.to >= input.from, {
  path: ['to'],
  message: 'A report ends on or after the day it starts',
})

export type ReportInput = z.output<typeof reportQuery>
