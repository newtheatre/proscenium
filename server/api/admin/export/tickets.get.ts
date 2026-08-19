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
 * The whole CSV is built in memory in one Worker, so the row count is capped
 * rather than left to whichever filter the caller happened to supply.
 */
const MAX_EXPORT_ROWS = 20_000

/**
 * GET /api/admin/export/tickets — ticket data as CSV, for the treasurer.
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
      from ? gte(schema.performances.startsAt, validityStart(from)) : undefined,
      to ? lte(schema.performances.startsAt, validityEnd(to)) : undefined,
    ))
    .orderBy(
      asc(schema.shows.title),
      asc(schema.performances.startsAt),
      asc(schema.reservations.bookingRef),
    )
    .limit(MAX_EXPORT_ROWS + 1)

  if (rows.length > MAX_EXPORT_ROWS) {
    throw createError({
      statusCode: 400,
      statusMessage: `That covers more than ${MAX_EXPORT_ROWS} tickets, which is too large to build in one request. Narrow the dates, or export one show at a time.`,
    })
  }

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
  // Neutralise spreadsheet formula injection: a cell beginning = + - @ is
  // treated as a formula, and these values are customer-controlled.
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

    // Two imported rows carry a negative price from an ETL rounding remainder;
    // unflagged they quietly subtract from a spreadsheet total.
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
