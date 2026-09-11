import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import type { BoundStatement } from './database'

// A venue, a show and a performance inside tonight's show night, for every suite that needs one
// (build-order contract d). Seed changes are closed after Wave 0; fixtures come from here.

// 19:30 London, which is 15.5 hours after the night's 04:00 start whatever the clocks did.
const CURTAIN_HOURS_AFTER_NIGHT_START = 15.5

// Later of 19:30 and two hours from now, capped short of the night's 04:00 close (0014): a
// query filtering on `starts_at >= now` must still find tonight's fixture ahead, whatever now is.
function defaultCurtainHours(night: string): number {
  const bounds = showNightBounds(night)
  const nightLengthHours = (bounds.to.getTime() - bounds.from.getTime()) / 3_600_000
  const hoursElapsed = (Date.now() - bounds.from.getTime()) / 3_600_000
  const HOURS_AHEAD_OF_NOW = 2
  const CLOSE_MARGIN_HOURS = 0.5
  return Math.min(
    Math.max(CURTAIN_HOURS_AFTER_NIGHT_START, hoursElapsed + HOURS_AHEAD_OF_NOW),
    nightLengthHours - CLOSE_MARGIN_HOURS,
  )
}

export interface TonightsPerformanceOptions {
  night?: string
  // Distinguishes a second fixture in the same suite: ids, the venue name and the slug take it.
  suffix?: string
  venueId?: string
  venueName?: string
  venueCapacity?: number | null
  roomId?: string | null
  showStatus?: 'DRAFT' | 'PUBLISHED'
  status?: 'DRAFT' | 'ON_SALE' | 'CANCELLED'
  curtainHoursAfterNightStart?: number
  capacityOverride?: number | null
  bookingClosesHoursBefore?: number | null
  externalBookingUrl?: string | null
}

export interface TonightsPerformance {
  night: string
  venueId: string
  showId: string
  performanceId: string
  startsAt: number
  venueCapacity: number | null
  capacityOverride: number | null
}

export interface AcceptsStatements {
  batch: (statements: BoundStatement[]) => void
}

// `reservations` and `tickets` come from `createTestDatabase()`'s real migrations (D-104);
// a suite needing seats to sell only has to add a ticket type on top of them.
export function ticketTypeFixture(into: AcceptsStatements): void {
  into.batch([[
    'INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)',
    'tt-standard', 'Standard', 900, 'SINGLE',
  ]])
}

export interface TestVenueOptions {
  suffix?: string
  name?: string
  capacity?: number | null
  roomId?: string | null
}

// A venue on its own, for a suite that needs somewhere to put a performance and nothing else.
export function testVenue(into: AcceptsStatements, options: TestVenueOptions = {}): { id: string, capacity: number | null } {
  const suffix = options.suffix ?? 'a'
  const id = `venue-${suffix}`
  const capacity = options.capacity === undefined ? 120 : options.capacity
  into.batch([[
    'INSERT INTO venues (id, name, capacity, room_id) VALUES (?, ?, ?, ?)',
    id, options.name ?? `The Test House ${suffix}`, capacity, options.roomId ?? null,
  ]])
  return { id, capacity }
}

export function tonightsPerformance(into: AcceptsStatements, options: TonightsPerformanceOptions = {}): TonightsPerformance {
  const night = options.night ?? currentShowNight()
  const suffix = options.suffix ?? 'a'
  const hours = options.curtainHoursAfterNightStart ?? defaultCurtainHours(night)
  const startsAt = Math.floor(showNightBounds(night).from.getTime() / 1000) + Math.round(hours * 3600)

  const venueId = options.venueId ?? `venue-${suffix}`
  const showId = `show-${suffix}`
  const performanceId = `performance-${suffix}`
  // A venue the caller supplied is a venue this does not write, so it reports no capacity for it
  // rather than a default it never stored.
  const venueCapacity = options.venueCapacity ?? (options.venueId ? null : 120)
  const capacityOverride = options.capacityOverride ?? null

  const statements: BoundStatement[] = []

  statements.push(
    ['INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)',
      showId, `a-test-show-${suffix}`, 'A Test Show', options.showStatus ?? 'PUBLISHED'],
    [`INSERT INTO performances (
        id, show_id, venue_id, starts_at, doors_at, duration_minutes, capacity_override,
        booking_closes_hours_before, external_booking_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    performanceId, showId, venueId, startsAt, startsAt - 1800, 120, capacityOverride,
    options.bookingClosesHoursBefore ?? null, options.externalBookingUrl ?? null,
    options.status ?? 'ON_SALE'],
  )

  if (!options.venueId) {
    testVenue(into, { suffix, name: options.venueName, capacity: venueCapacity, roomId: options.roomId })
  }
  into.batch(statements)

  return { night, venueId, showId, performanceId, startsAt, venueCapacity, capacityOverride }
}
