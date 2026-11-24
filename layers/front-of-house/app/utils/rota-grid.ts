// The rota grid's shapes as the server sends them (FH-48), and the time-of-day field's conversions.
import { parseTime } from '@internationalized/date'

export interface GridShift { id: string, title: string | null, callAt: number, endsAt: number, places: number, placesTaken: number, state: string, batchId: string | null, crewCallId: string | null, urgent: boolean }
export interface GridRow { venueId: string | null, venueName: string, dutyId: string, dutyName: string, cells: Record<string, GridShift[]> }
export interface GridPerformances { venueId: string, venueName: string, day: string, shifts: number, performanceIds: string[] }
export interface RotaGrid { days: string[], rows: GridRow[], performances: GridPerformances[], can: { manage: boolean } }
export interface GridChoices {
  venues: { id: string, name: string }[]
  spaces: { id: string, name: string, venueId: string }[]
  duties: { id: string, name: string }[]
  crewCalls: { id: string, name: string }[]
}
/** A picked cell: a venue's night, and the duty when it is a duty's row rather than the venue's own. */
export interface GridCell { venueId: string, dutyId: string | null, day: string }
/** One venue's lines in the grid: its duty rows and its nights' performance shift counts. */
export interface GridVenue { id: string, name: string, rows: GridRow[], performances: Record<string, GridPerformances> }

/** The "any" or "none" choice in a filter or a select. */
export const GRID_ANY = 'any'

export function timeValue(value: string) {
  try {
    return value ? parseTime(value) : undefined
  }
  catch {
    return undefined
  }
}

export const timeText = (value: unknown): string => value ? String(value).slice(0, 5) : '' // not-policy: HH:mm

export const shiftPage = (id: string) => `/members/front-of-house/shifts/${encodeURIComponent(id)}`
