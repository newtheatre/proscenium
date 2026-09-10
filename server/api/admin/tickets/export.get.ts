import { z } from 'zod'
import { toCsv } from '#server/utils/csv'
import { ticketExportRows } from '#server/utils/ticket-export'
import { resolveSeasonBounds, TICKET_EXPORT_CAP } from '#shared/utils/ticket-export'
import { RESERVATION_SOURCES } from '#shared/utils/reservations'
import { saysReservationStatus } from '#shared/utils/capacity'
import { saysMoney } from '#shared/utils/bar'
import { formatLondon, startOfLondonDay } from '#shared/utils/london'
import type { TicketExportFilter } from '#server/utils/ticket-export'

const DAY_SECONDS = 24 * 60 * 60
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const query = z.object({
  showId: z.string().trim().min(1).optional(),
  performanceId: z.string().trim().min(1).optional(),
  source: z.enum(RESERVATION_SOURCES).optional(),
  season: z.coerce.number().int().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
})
  .refine(input => input.season === undefined || (input.from === undefined && input.to === undefined),
    { message: 'Use a season or a date range, not both' })
  .refine(input => (input.from === undefined) === (input.to === undefined),
    { message: 'A date range needs both from and to' })

// Season sales for reporting (D-129), filtered by show, performance, date range and source.
// The column list is criterion 3 itself: no customer name, no notes, no access data, ever.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.export')
  const input = await getValidatedQueryOrThrow(event, query)

  const filter: TicketExportFilter = {
    showId: input.showId,
    performanceId: input.performanceId,
    source: input.source,
  }

  if (input.season !== undefined) {
    const seasonStart = await configValue(event, 'SEASON_START')
    const seasonEnd = await configValue(event, 'SEASON_END')
    const bounds = resolveSeasonBounds(input.season, seasonStart, seasonEnd)
    filter.fromAt = bounds.fromAt
    filter.toAt = bounds.toAt
  }
  else if (input.from !== undefined && input.to !== undefined) {
    filter.fromAt = Math.floor(startOfLondonDay(input.from).getTime() / 1000)
    filter.toAt = Math.floor(startOfLondonDay(input.to).getTime() / 1000) + DAY_SECONDS
  }

  const rows = await ticketExportRows(filter)
  if (rows.length > TICKET_EXPORT_CAP) {
    throw createError({
      statusCode: 400,
      statusMessage: `This export would return more than ${new Intl.NumberFormat('en-GB').format(TICKET_EXPORT_CAP)} `
        + 'rows. Narrow the show, performance, date range or source and try again.',
    })
  }

  // Taking a copy of season sales is an act on it, so it lands in the trail (criterion 4).
  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'tickets.exported',
    target: null,
    detail: { ...input, rows: rows.length },
  }))

  const csv = toCsv(rows.map(row => ({
    reference: row.reference,
    performance: `${row.showTitle}, ${formatLondon(new Date(row.startsAt * 1000), { dateStyle: 'medium', timeStyle: 'short' })}`,
    type: row.typeName,
    price: saysMoney(row.pricePaid),
    source: row.source,
    collected: saysReservationStatus(row.status),
    refunded: row.refundedAt === null ? 'no' : 'yes',
  })))

  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', 'attachment; filename="ticket-export.csv"')
  return csv
})
