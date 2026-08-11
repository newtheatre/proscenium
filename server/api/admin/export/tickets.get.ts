import { db, schema } from '@nuxthub/db'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod/v4'
import { isAdminOrManager } from '~~/shared/utils/abilities'
import type { AbilityUser } from '~~/shared/utils/abilities'

const querySchema = z.object({
  showId: z.string().optional(),
  performanceId: z.string().optional(),
})

/**
 * GET /api/admin/export/tickets — download all ticket data as a CSV file.
 * ADMIN and MANAGER only. Intended for the treasurer / financial reporting.
 *
 * Query params:
 *   showId        — filter to a specific show (optional)
 *   performanceId — filter to a specific performance (optional; takes precedence over showId)
 *
 * All statuses are included in the export so the treasurer has a full audit trail.
 * Refunded tickets are marked explicitly in the "Refunded" column.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, defineAbility((user: AbilityUser) => isAdminOrManager(user)))

  const { showId, performanceId } = await getValidatedQuery(event, querySchema.parse)

  // Resolve performance IDs when only a showId is provided
  let perfIds: string[] | undefined
  if (showId && !performanceId) {
    const perfs = await db
      .select({ id: schema.performances.id })
      .from(schema.performances)
      .where(eq(schema.performances.showId, showId))

    perfIds = perfs.map(p => p.id)

    if (perfIds.length === 0) {
      // Show has no performances — return an empty CSV
      setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
      setHeader(event, 'Content-Disposition', 'attachment; filename="nnt-tickets.csv"')
      return buildCsv([])
    }
  }

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
      !performanceId && perfIds ? inArray(schema.tickets.performanceId, perfIds) : undefined,
    ))
    .orderBy(
      asc(schema.shows.title),
      asc(schema.performances.startsAt),
      asc(schema.reservations.bookingRef),
    )

  const slug = showId ? `show-${showId.slice(0, 8)}` : performanceId ? `perf-${performanceId.slice(0, 8)}` : 'all'
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
    'Price Paid (£)',
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
    const pricePounds = (r.pricePaid / 100).toFixed(2)

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
      csvCell(pricePounds),
      csvCell(r.reservedAt),
      csvCell(r.customerNotes),
      csvCell(r.staffNotes),
    ].join(','))
  }

  return lines.join('\n')
}
