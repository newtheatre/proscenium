import { z } from 'zod'
import { CATEGORIES, SEVERITIES } from './incidents'
import type { Category, Severity } from './incidents'

// Cross-season report queries (E-126): every range comes from `periodBounds`
// (season-dashboard.ts), reused as-is rather than a second resolver of a season's start.

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
  venueId: z.string().trim().min(1).optional(),
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
  venueId: z.string().trim().min(1).optional(),
})

export type PerformanceReportFilter = z.output<typeof performanceReportFilter>
