import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { showNightBounds, showNightOf } from '#shared/utils/show-night'
import type { SQL } from 'drizzle-orm'

// Reading the programme (build-order contract d). The show-night boundary is
// `shared/utils/show-night.ts`'s alone; nothing here restates it (E-110, 0014).

export type PerformanceStatus = 'DRAFT' | 'ON_SALE' | 'CANCELLED'
export type ShowStatus = 'DRAFT' | 'PUBLISHED'

const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

// A stored curtain is integer seconds UTC; a Date is accepted so a caller with an instant in
// hand does not have to convert one just to ask.
export function performanceNight(curtain: Date | number): string {
  return showNightOf(typeof curtain === 'number' ? new Date(curtain * 1000) : curtain)
}

export interface PerformanceOnNight {
  id: string
  night: string
  showId: string
  showSlug: string
  showTitle: string
  showStatus: ShowStatus
  venueId: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  status: PerformanceStatus
  externalBookingUrl: string | null
  capacity: number | null
}

// Allow-listed and bound to a fixed two or three parameters however many performances the night
// holds, so nothing here grows with the data (0006).
export function performancesOnNightQuery(night: string, venueId?: string): SQL {
  const { from, to } = showNightBounds(night)
  const narrowed = venueId ? sql` AND p.venue_id = ${venueId}` : sql``

  return sql`
    SELECT p.id AS id,
           p.show_id AS showId,
           s.slug AS showSlug,
           s.title AS showTitle,
           s.status AS showStatus,
           p.venue_id AS venueId,
           v.name AS venueName,
           p.starts_at AS startsAt,
           p.doors_at AS doorsAt,
           p.duration_minutes AS durationMinutes,
           p.interval_count AS intervalCount,
           p.status AS status,
           p.external_booking_url AS externalBookingUrl,
           coalesce(p.capacity_override, v.capacity) AS capacity
    FROM performances p
    JOIN shows s ON s.id = p.show_id
    JOIN venues v ON v.id = p.venue_id
    WHERE p.starts_at >= ${seconds(from)} AND p.starts_at < ${seconds(to)}${narrowed}
    ORDER BY p.starts_at, v.name, p.id
  `
}

// Every performance the night holds, across the whole estate, narrowed by venue only when asked:
// two venues may run at once, and one venue may run a matinee and an evening (E-127 criterion 1).
export async function performancesOnNight(night: string, venueId?: string): Promise<PerformanceOnNight[]> {
  const found = await db.all<Omit<PerformanceOnNight, 'night'>>(performancesOnNightQuery(night, venueId))
  return found.map(performance => ({ ...performance, night }))
}

// Null is uncapped and nought is a closed house, so this resolves by absence and never by
// falsiness (0006).
export function effectiveCapacity(performance: { capacityOverride: number | null, venueCapacity: number | null }): number | null {
  return performance.capacityOverride ?? performance.venueCapacity
}

export interface PerformanceSaleState {
  status: PerformanceStatus
  showStatus: ShowStatus
  startsAt: number
  bookingClosesHoursBefore: number | null
  externalBookingUrl: string | null
}

// The one predicate every internal sales path asks: an unpublished show, a draft or cancelled
// performance, an external link-out and a closed window each refuse (D-112, D-121, D-122).
export function isOnSale(performance: PerformanceSaleState, at: Date = new Date()): boolean {
  if (performance.status !== 'ON_SALE' || performance.showStatus !== 'PUBLISHED') return false
  if (performance.externalBookingUrl) return false

  const closes = performance.startsAt - (performance.bookingClosesHoursBefore ?? 0) * 3600
  return seconds(at) < closes
}
