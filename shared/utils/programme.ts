import { z } from 'zod'
import { formatLondon } from './london'

// The publish flow and the booking window (D-121, D-112). A show is draft until somebody
// publishes it; a performance is on sale, off sale or cancelled, one at a time and never per day.

export const SHOW_STATUSES = ['DRAFT', 'PUBLISHED'] as const
export const PERFORMANCE_STATUSES = ['DRAFT', 'ON_SALE', 'CANCELLED'] as const
export const LATECOMER_POLICIES = ['ADMITTED', 'AT_INTERVAL', 'NOT_ADMITTED'] as const

export type ShowStatus = (typeof SHOW_STATUSES)[number]
export type PerformanceStatus = (typeof PERFORMANCE_STATUSES)[number]
export type LatecomerPolicy = (typeof LATECOMER_POLICIES)[number]

// Both sit at the audit trail's string limit, so a rename can always be recorded with both
// values rather than as a bare "it changed" (0011).
export const MAX_SHOW_TITLE = 120
export const MAX_SHOW_SLUG = 120

// A window opening more than a month before curtain is a typed mistake, not a policy.
export const MAX_BOOKING_CLOSES_HOURS = 720

// A ten hour show is Wagner, and this is not that theatre.
export const MAX_PERFORMANCE_MINUTES = 600

// Long enough for a ticketing platform's query string, short enough to catch a pasted essay.
export const MAX_EXTERNAL_BOOKING_URL = 500

// Lowercase words joined by single hyphens. The public URL is the slug, so it is stated once here
// and never derived twice (D-101).
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_SHOW_SLUG)
}

const hoursBefore = z.number().int().nonnegative().max(MAX_BOOKING_CLOSES_HOURS)

const optionalText = (max: number) => z.string().trim().max(max).nullish()

// A blank field means no link, same as the screen's other optional fields; a filled one has to
// look like a URL (D-122).
const optionalUrl = (max: number) => z.string().trim().max(max)
  .refine(value => value === '' || z.url().safeParse(value).success, 'That does not look like a web address')
  .nullish()

export const showForm = z.object({
  title: z.string().trim().min(1, 'A show needs a title').max(MAX_SHOW_TITLE),
  slug: z.string().trim().min(1, 'A show needs a slug').max(MAX_SHOW_SLUG)
    .refine(value => SLUG.test(value), 'A slug is lowercase words joined by hyphens'),
  subtitle: optionalText(200),
  description: optionalText(500),
  longDescription: optionalText(20_000),
  ageGuidance: optionalText(120),
  latecomerPolicy: z.enum(LATECOMER_POLICIES).nullish(),
  categoryId: z.string().trim().min(1).nullish(),
  seasonId: z.string().trim().min(1).nullish(),
  // The default every performance of this show inherits when it states none of its own (D-112).
  bookingClosesHoursBefore: hoursBefore.nullish(),
})

// Publishing is its own action, so saving the copy can never change the status by accident.
export const publishShowForm = z.object({
  published: z.boolean(),
  // Publishing may take the show's draft performances on sale with it, cancelled ones excepted.
  cascadePerformances: z.boolean().default(false),
})

// Everything about a performance that is not a moment. The request and the screen take the same
// fields and differ only in how each spells the times.
const performanceFields = {
  venueId: z.string().trim().min(1, 'A performance needs a venue'),
  durationMinutes: z.number().int().positive().max(MAX_PERFORMANCE_MINUTES).nullish(),
  intervalCount: z.number().int().nonnegative().max(5).default(0),
  intervalMinutes: z.number().int().nonnegative().max(120).nullish(),
  capacityOverride: z.number().int().nonnegative().nullish(),
  bookingClosesHoursBefore: hoursBefore.nullish(),
  // Set: every internal sales path refuses, quoting it. Cleared: sales stay off until an
  // explicit on-sale action, never automatically (D-122 criteria 1 and 3).
  externalBookingUrl: optionalUrl(MAX_EXTERNAL_BOOKING_URL),
  notes: optionalText(2000),
}

export const performanceForm = z.object({
  ...performanceFields,
  // Integer seconds UTC, as the column stores it. The screen sends an instant, never a wall clock.
  startsAt: z.number().int().positive(),
  doorsAt: z.number().int().positive().nullish(),
}).refine(input => input.doorsAt == null || input.doorsAt <= input.startsAt, {
  message: 'Doors open before curtain, not after it',
  path: ['doorsAt'],
})

// Exported for other screens that hold a London day as a plain string before turning it into an
// instant, such as a pass's validity window (D-123).
export const CIVIL_DAY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/

// What the screen holds: a London day and wall clocks, which it turns into instants before it
// sends them. Validating the request shape against this state would fail on every field (0014).
export const performanceScreenForm = z.object({
  ...performanceFields,
  day: z.string().regex(CIVIL_DAY, 'A performance needs a day'),
  clock: z.string().regex(CLOCK, 'A curtain time reads HH:MM'),
  doorsClock: z.union([z.literal(''), z.string().regex(CLOCK, 'A doors time reads HH:MM')]),
})

export const performanceSaleForm = z.object({
  onSale: z.boolean(),
})

export type ShowInput = z.output<typeof showForm>
export type PerformanceInput = z.output<typeof performanceForm>

// What the console reads. `soldTickets` is counted from the tables that reference the performance
// and never stored, so it cannot drift from the rows it describes (D-121 criterion 5).
export interface AdminShow {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  longDescription: string | null
  ageGuidance: string | null
  latecomerPolicy: LatecomerPolicy | null
  categoryId: string | null
  seasonId: string | null
  bookingClosesHoursBefore: number | null
  status: ShowStatus
  performanceCount: number
  onSaleCount: number
  soldTickets: number
  // Counted from the junction, so "confirmed clear" and "nobody has looked" stay distinct
  // states rather than one empty list (D-102 criterion 2).
  warningsConfirmedNone: boolean
  warningCount: number
}

export interface AdminPerformance {
  id: string
  showId: string
  venueId: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  capacityOverride: number | null
  venueCapacity: number | null
  bookingClosesHoursBefore: number | null
  externalBookingUrl: string | null
  status: PerformanceStatus
  notes: string | null
  soldTickets: number
}

// The columns a visitor may see. Anything absent here is absent from every public payload, which
// is what an allow-list buys over a deny-list (CONTRIBUTING, D-121 criterion 1).
export interface PublicShow {
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  longDescription: string | null
  ageGuidance: string | null
  latecomerPolicy: LatecomerPolicy | null
}

export interface PublicPerformance {
  id: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  venueName: string
  externalBookingUrl: string | null
  bookingClosesAt: number
  cancelled: boolean
}

export function isPublishedShow(show: { status: ShowStatus }): boolean {
  return show.status === 'PUBLISHED'
}

// A draft show has no public page at all, so this answers with nothing rather than a thinner row:
// the listing and the show page both refuse from the same answer (D-101, D-102).
export function publicShow(show: PublicShow & { status: ShowStatus }): PublicShow | null {
  if (!isPublishedShow(show)) return null
  return {
    slug: show.slug,
    title: show.title,
    subtitle: show.subtitle,
    description: show.description,
    longDescription: show.longDescription,
    ageGuidance: show.ageGuidance,
    latecomerPolicy: show.latecomerPolicy,
  }
}

// A cancelled performance stays visible so a booker holding a ticket is told; a draft one has
// never been on sale and is nobody's business yet (D-121 criteria 1 and 5).
export function isPublicPerformance(performance: { status: PerformanceStatus }): boolean {
  return performance.status !== 'DRAFT'
}

export function saysShowStatus(status: string): string {
  return status === 'PUBLISHED' ? 'Published' : 'Draft'
}

export function saysPerformanceStatus(status: string): string {
  if (status === 'ON_SALE') return 'On sale'
  if (status === 'CANCELLED') return 'Cancelled'
  return 'Off sale'
}

export function saysLatecomerPolicy(policy: string | null): string {
  if (policy === 'ADMITTED') return 'Latecomers admitted'
  if (policy === 'AT_INTERVAL') return 'Latecomers admitted at the interval'
  if (policy === 'NOT_ADMITTED') return 'Latecomers not admitted'
  return 'Not yet stated'
}

// The performance's own offset, then the show's, then curtain-up. NULL means inherit and an
// explicit nought means this level says curtain-up, as prices resolve (D-112 criterion 1, D-120).
export function resolveBookingClosesHours(
  performance: { bookingClosesHoursBefore: number | null },
  show: { bookingClosesHoursBefore: number | null },
): number {
  return performance.bookingClosesHoursBefore ?? show.bookingClosesHoursBefore ?? 0
}

export type BookingWindowSource = 'performance' | 'show' | 'curtain-up'

export function bookingWindowSource(
  performance: { bookingClosesHoursBefore: number | null },
  show: { bookingClosesHoursBefore: number | null },
): BookingWindowSource {
  if (performance.bookingClosesHoursBefore !== null) return 'performance'
  if (show.bookingClosesHoursBefore !== null) return 'show'
  return 'curtain-up'
}

export function saysBookingWindow(hours: number): string {
  if (hours === 0) return 'Closes at curtain-up'
  return `Closes ${hours === 1 ? '1 hour' : `${hours} hours`} before curtain`
}

// The moment online booking closes, in integer seconds UTC. An hour is 3600 seconds whatever the
// clocks did: the offset is measured back from the curtain, never across a wall clock.
export function bookingClosesAt(startsAt: number, hoursBefore: number): number {
  return startsAt - hoursBefore * 3600
}

// Quoted in Europe/London, because the Worker runs in UTC and a booker reads a clock (0014).
export function saysClosingTime(closesAt: number): string {
  return formatLondon(new Date(closesAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
}

// Everything a sales path needs to decide, resolved from the performance and its show. The show's
// status and window are carried because a performance alone cannot answer either (D-112, D-121).
export interface PerformanceSaleState {
  status: PerformanceStatus
  showStatus: ShowStatus
  startsAt: number
  bookingClosesHoursBefore: number | null
  showBookingClosesHoursBefore: number | null
  externalBookingUrl: string | null
}

// The desk may sell after the customer window has closed; nothing else about the refusal moves.
// The bypass is recorded on the reservation, which D-104 builds (D-112 criterion 3).
export type SalesChannel = 'CUSTOMER' | 'DESK'

export type SaleRefusalReason = 'SHOW_UNPUBLISHED' | 'NOT_ON_SALE' | 'CANCELLED' | 'EXTERNAL' | 'WINDOW_CLOSED'

export interface SaleRefusal {
  reason: SaleRefusalReason
  says: string
  // Present on WINDOW_CLOSED, so a caller can quote the time it closed without recomputing it.
  closedAt?: number
  externalBookingUrl?: string
}

export function performanceClosesAt(performance: PerformanceSaleState): number {
  return bookingClosesAt(performance.startsAt, resolveBookingClosesHours(performance, {
    bookingClosesHoursBefore: performance.showBookingClosesHoursBefore,
  }))
}

// Why a sales path may not sell this performance, or null when it may. Every internal path asks
// this one question, so a refusal reads the same at the desk as it does online (D-112, D-121).
export function saleRefusal(
  performance: PerformanceSaleState,
  at: Date = new Date(),
  channel: SalesChannel = 'CUSTOMER',
): SaleRefusal | null {
  if (performance.status === 'CANCELLED') {
    return { reason: 'CANCELLED', says: 'This performance has been cancelled.' }
  }
  if (performance.showStatus !== 'PUBLISHED') {
    return { reason: 'SHOW_UNPUBLISHED', says: 'This show is not on sale.' }
  }
  if (performance.status !== 'ON_SALE') {
    return { reason: 'NOT_ON_SALE', says: 'This performance is not on sale.' }
  }
  if (performance.externalBookingUrl) {
    return {
      reason: 'EXTERNAL',
      says: 'Tickets for this performance are sold elsewhere.',
      externalBookingUrl: performance.externalBookingUrl,
    }
  }

  const closedAt = performanceClosesAt(performance)
  // The desk bypasses the customer window and nothing else: a cancelled or externally ticketed
  // performance refuses at the desk exactly as it refuses online.
  if (channel === 'CUSTOMER' && Math.floor(at.getTime() / 1000) >= closedAt) {
    return {
      reason: 'WINDOW_CLOSED',
      says: `Online booking closed at ${saysClosingTime(closedAt)}. Tickets are on the door, subject to availability.`,
      closedAt,
    }
  }

  return null
}

// The allow-list a listing and a show page both build from. `bookingClosesAt` is resolved here
// rather than sent as an offset, so no consumer has to know the inheritance rule (D-101, D-112).
export function publicPerformance(performance: PerformanceSaleState & {
  id: string
  venueName: string
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes?: number | null
}): PublicPerformance | null {
  if (!isPublicPerformance(performance)) return null
  return {
    id: performance.id,
    startsAt: performance.startsAt,
    doorsAt: performance.doorsAt,
    durationMinutes: performance.durationMinutes,
    intervalCount: performance.intervalCount,
    intervalMinutes: performance.intervalMinutes ?? null,
    venueName: performance.venueName,
    externalBookingUrl: performance.externalBookingUrl,
    bookingClosesAt: performanceClosesAt(performance),
    cancelled: performance.status === 'CANCELLED',
  }
}

// What a visitor is told about a house, computed here so the listing and the show page cannot
// disagree (D-101 criterion 2). Cancelled and external are carried by the projection beside it.
export const AVAILABILITY_STATES = ['AVAILABLE', 'LIMITED', 'SOLD_OUT', 'BOOKING_CLOSED'] as const

export type Availability = (typeof AVAILABILITY_STATES)[number]

export interface PerformanceHouse {
  // Null is an uncapped venue, which is never limited and never sold out.
  capacity: number | null
  sold: number
}

export function remainingSeats(house: PerformanceHouse): number | null {
  if (house.capacity === null) return null
  return Math.max(0, house.capacity - house.sold)
}

// A refusal comes first whatever the seats say: offering a button that would 409 is worse than
// saying booking is closed. `saleRefusal` stays the only reading of on sale (D-112, D-121).
export function performanceAvailability(
  performance: PerformanceSaleState,
  house: PerformanceHouse,
  limitedAtOrBelowPercent: number,
  at: Date = new Date(),
): Availability {
  if (saleRefusal(performance, at) !== null) return 'BOOKING_CLOSED'

  const remaining = remainingSeats(house)
  if (remaining === null) return 'AVAILABLE'
  if (remaining === 0) return 'SOLD_OUT'
  return remaining <= Math.ceil((house.capacity ?? 0) * limitedAtOrBelowPercent / 100) ? 'LIMITED' : 'AVAILABLE'
}

export function saysAvailability(state: Availability, remaining: number | null): string {
  if (state === 'SOLD_OUT') return 'Sold out'
  if (state === 'BOOKING_CLOSED') return 'Booking closed'
  if (state === 'LIMITED' && remaining !== null) return `${remaining === 1 ? '1 ticket' : `${remaining} tickets`} left`
  return 'Tickets available'
}

// The longest a public listing may be held anywhere, which is what the stated cache lifetime means
// on the page and in docs/operations.md (0045).
export const LISTED_CACHE_MAX_SECONDS = 300

// A cached listing may not outlive the earliest moment one of its answers changes, so a window
// closing in forty seconds caps the response at forty seconds (D-112 criterion 4, 0045).
export function listingCacheSeconds(boundaries: number[], at: Date = new Date()): number {
  const now = Math.floor(at.getTime() / 1000)
  const soonest = boundaries.filter(boundary => boundary > now).sort((a, b) => a - b)[0]
  if (soonest === undefined) return LISTED_CACHE_MAX_SECONDS
  return Math.max(0, Math.min(LISTED_CACHE_MAX_SECONDS, soonest - now))
}
