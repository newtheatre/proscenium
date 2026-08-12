import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { z } from 'zod/v4'
import { isAdminOrManager } from '~~/shared/utils/abilities'
import type { AbilityUser } from '~~/shared/utils/abilities'

const querySchema = z.object({
  showId: z.string().optional(),
  performanceId: z.string().optional(),
  /** Inclusive performance-date bounds, YYYY-MM-DD, interpreted in UK time. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/**
 * GET /api/admin/export/tickets — download ticket data as a CSV file.
 * ADMIN and MANAGER only. Intended for the treasurer / financial reporting.
 *
 * Query params — at least one bound is required:
 *   performanceId — a single performance (takes precedence over showId)
 *   showId        — every performance of one show
 *   from / to     — inclusive performance-date range, YYYY-MM-DD
 *
 * The bound is not optional. Unfiltered, this six-way join covers all 45,563
 * tickets, reads roughly 320,000 rows and concatenates about 10 MB of CSV in
 * Worker memory against a 30 s query cap — and "All shows" used to be the
 * default choice in the admin UI, one click away.
 *
 * All statuses are included so the treasurer has a full audit trail. Refunded
 * tickets are marked in the "Refunded" column.
 *
 * On money: the legacy import brought in prices of varying trustworthiness, so
 * the export states which is which rather than presenting them all as fact.
 * "Price Confidence" is EXACT, DERIVED (apportioned from a booking total) or
 * UNKNOWN (never recorded). UNKNOWN rows leave the price cell empty instead of
 * writing 0.00, which was indistinguishable from a genuine comp. "Ticket Kind"
 * separates PASS_SALE (the sale of a pass) from PASS_ADMISSION (an entry it
 * paid for), which must not be added together.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, defineAbility((user: AbilityUser) => isAdminOrManager(user)))

  const { showId, performanceId, from, to } = await getValidatedQuery(event, querySchema.parse)

  if (!performanceId && !showId && !from && !to) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Choose a show, a performance or a date range. Exporting every ticket at once is too large to build in one request.',
    })
  }

  // A subquery, not a list of ids: a show with more than 100 performances would
  // breach D1's 100-bound-parameter limit, and the archive has several.
  const showPerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(eq(schema.performances.showId, showId ?? ''))

  const rows = await db
    .select({
      bookingRef: schema.reservations.bookingRef,
      reservationStatus: schema.reservations.status,
      reservedAt: schema.reservations.createdAt,
      customerNotes: schema.reservations.customerNotes,
      staffNotes: schema.reservations.staffNotes,
      customerName: schema.users.name,
      customerEmail: schema.users.email,
      showTitle: schema.shows.title,
      performanceStartsAt: schema.performances.startsAt,
      venueName: schema.venues.name,
      ticketTypeName: schema.ticketTypes.name,
      pricePaid: schema.tickets.pricePaid,
      priceConfidence: schema.tickets.priceConfidence,
      ticketKind: schema.ticketTypes.kind,
      refundedAt: schema.tickets.refundedAt,
    })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
    .innerJoin(schema.users, eq(schema.reservations.userId, schema.users.id))
    .innerJoin(schema.performances, eq(schema.tickets.performanceId, schema.performances.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .innerJoin(schema.ticketTypes, eq(schema.tickets.ticketTypeId, schema.ticketTypes.id))
    .where(and(
      performanceId ? eq(schema.tickets.performanceId, performanceId) : undefined,
      !performanceId && showId ? inArray(schema.tickets.performanceId, showPerformances) : undefined,
      from ? gte(schema.performances.startsAt, new Date(`${from}T00:00:00Z`)) : undefined,
      to ? lte(schema.performances.startsAt, new Date(`${to}T23:59:59Z`)) : undefined,
    ))
    .orderBy(
      asc(schema.shows.title),
      asc(schema.performances.startsAt),
      asc(schema.reservations.bookingRef),
    )

  const slug = performanceId
    ? `perf-${performanceId.slice(0, 8)}`
    : showId
      ? `show-${showId.slice(0, 8)}`
      : `${from ?? 'start'}-to-${to ?? 'end'}`
  const filename = `nnt-tickets-${slug}-${new Date().toISOString().slice(0, 10)}.csv`

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)

  return buildCsv(rows)
})

// ── CSV helpers ──────────────────────────────────────────────────────────────

type TicketRow = {
  bookingRef: string
  reservationStatus: string
  reservedAt: string
  customerNotes: string | null
  staffNotes: string | null
  customerName: string
  customerEmail: string
  showTitle: string
  performanceStartsAt: Date | number | string
  venueName: string
  ticketTypeName: string
  pricePaid: number
  priceConfidence: 'EXACT' | 'DERIVED' | 'UNKNOWN'
  ticketKind: 'SINGLE' | 'PASS_SALE' | 'PASS_ADMISSION'
  refundedAt: Date | string | null
}

function csvCell(val: string | number | null | undefined): string {
  if (val == null) return ''
  let str = String(val)
  // Neutralise spreadsheet formula injection: Excel/Sheets treat a cell that
  // begins with = + - @ (optionally after a tab or carriage return) as a
  // formula. Customer-controlled fields flow into this export, so prefix any
  // such cell with an apostrophe to force it to be read as text.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildCsv(rows: TicketRow[]): string {
  const headers = [
    'Booking Ref',
    'Status',
    'Refunded',
    'Customer Name',
    'Customer Email',
    'Show',
    'Performance Date',
    'Performance Time',
    'Venue',
    'Ticket Type',
    'Ticket Kind',
    'Price Paid (£)',
    'Price Confidence',
    'Price Note',
    'Booked At',
    'Customer Notes',
    'Staff Notes',
  ]

  const lines: string[] = [headers.map(csvCell).join(',')]

  for (const r of rows) {
    const startsAt = r.performanceStartsAt instanceof Date
      ? r.performanceStartsAt
      : new Date(typeof r.performanceStartsAt === 'number' ? r.performanceStartsAt * 1000 : r.performanceStartsAt)

    const perfDate = startsAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
    const perfTime = startsAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' })
    // An UNKNOWN price was never recorded by the legacy system. Writing 0.00
    // made it look like a comp; an empty cell sums the same and does not lie.
    const pricePounds = r.priceConfidence === 'UNKNOWN' ? '' : (r.pricePaid / 100).toFixed(2)

    // Two imported rows carry a negative price, from the ETL pushing a rounding
    // remainder onto a £0 line. Left unflagged they quietly subtract from any
    // spreadsheet total. The value is preserved rather than clamped — this is an
    // audit trail, and silently editing the figures would be worse.
    const priceNote = r.pricePaid < 0
      ? 'Negative — apportioning remainder, check against the booking total'
      : r.priceConfidence === 'UNKNOWN'
        ? 'Price was never recorded in the legacy system'
        : r.priceConfidence === 'DERIVED'
          ? 'Estimated by apportioning the booking total'
          : ''

    lines.push([
      csvCell(r.bookingRef),
      csvCell(r.reservationStatus),
      csvCell(r.refundedAt ? 'Yes' : 'No'),
      csvCell(r.customerName),
      csvCell(r.customerEmail),
      csvCell(r.showTitle),
      csvCell(perfDate),
      csvCell(perfTime),
      csvCell(r.venueName),
      csvCell(r.ticketTypeName),
      csvCell(r.ticketKind),
      csvCell(pricePounds),
      csvCell(r.priceConfidence),
      csvCell(priceNote),
      csvCell(r.reservedAt),
      csvCell(r.customerNotes),
      csvCell(r.staffNotes),
    ].join(','))
  }

  return lines.join('\n')
}
