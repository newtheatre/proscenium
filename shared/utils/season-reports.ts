import { z } from 'zod'
import { CATEGORIES, SEVERITIES } from './incidents'
import type { Category, Severity } from './incidents'
import type { NightRole } from './night-authority'

// Cross-season report queries (E-126): every range comes from `resolvePeriodBounds`
// (season-dashboard.ts), reused as-is rather than a second resolver of a period's start.

export interface IncidentTrendRow {
  category: Category
  severity: Severity
  venueId: string
  venueName: string
  count: number
}

export const incidentTrendFilter = z.object({
  category: z.enum(CATEGORIES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  venueId: z.string().trim().min(1, 'Say which venue you mean').optional(),
})

export type IncidentTrendFilter = z.output<typeof incidentTrendFilter>

export interface PerformanceReportRow {
  performanceId: string
  startsAt: number
  venueId: string
  venueName: string
  showTitle: string
  sold: number
  admitted: number
  noShows: number
  unfilledSlots: number
  officerBypass: boolean
  autoClosed: boolean
}

export const performanceReportFilter = z.object({
  venueId: z.string().trim().min(1, 'Say which venue you mean').optional(),
})

export type PerformanceReportFilter = z.output<typeof performanceReportFilter>

export interface OpeningBypassRow {
  night: string
  role: NightRole
  venueId: string
  venueName: string
  openingLabel: string | null
  officerName: string | null
}

const STOOD_IN_AS: Record<NightRole, string> = { DUTY_MANAGER: 'as duty manager', DOOR: 'on the door', BAR: 'at the bar' }

// A bypass at a venue with nothing on has no night report, so this line is its only surface
// (E-130 criterion 6, issue 1537); a bar opened with none planned says so rather than go unsaid.
export function saysOpeningBypass(row: OpeningBypassRow): string {
  const who = row.officerName ?? 'An officer'
  const where = row.openingLabel ? `${row.openingLabel}, ${row.venueName}` : `${row.venueName}, with no bar opening planned`
  return `${who} stood in ${STOOD_IN_AS[row.role]} by officer role: ${where}`
}
