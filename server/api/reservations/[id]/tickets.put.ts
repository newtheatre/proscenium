import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { updateReservation } from '~~/shared/utils/abilities'

/**
 * PUT /api/reservations/:id/tickets Adjusts the active (non-refunded) ticket
 * composition of a reservation.
 */
const bodySchema = z.object({
  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.int().min(0).max(50),
  })).min(1),
}).refine(
  // Each entry is the desired TOTAL, read against a map that is never updated:
  // so two entries for one type would compound rather than replace.
  data => new Set(data.tickets.map(t => t.ticketTypeId)).size === data.tickets.length,
  { message: 'Each ticket type may only appear once' },
)

/** PUT /api/reservations/:id/tickets: update ticket quantities on a reservation. Staff only. */
export default defineEventHandler(async (event) => {
  await authorize(event, updateReservation)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const body = await readValidatedBody(event, bodySchema.parse)

  // ── Load reservation + performance/show context ────────────────────────────

  const reservation = await db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.id, id))
    .get()

  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })

  // Editing is another way to add tickets, so it needs the same gate as
  // creating them: the entitlement is the booker's (docs/12 §2.6).
  await assertAccessTicketsAllowed(reservation.userId, reservation.performanceId, body.tickets, { excludeReservationId: reservation.id })

  // Collected tickets are a record of a completed transaction, not a working
  // draft: the only reversal is a refund (ADR-0011).
  assertTicketsEditable(reservation.status)

  const { performanceId } = reservation

  // Resolve showId from the performance
  const perf = await db
    .select({ showId: schema.performances.showId })
    .from(schema.performances)
    .where(eq(schema.performances.id, performanceId))
    .get()

  if (!perf) throw createError({ statusCode: 500, statusMessage: 'Performance not found' })
  const showId = perf.showId

  const requestedTypeIds = body.tickets.map(t => t.ticketTypeId)

  // ── Load and validate ticket types + resolve effective prices ─────────────

  const priceCtx = await loadTicketPriceContext(requestedTypeIds, showId, performanceId)
  validateTicketTypesExist(requestedTypeIds, priceCtx)

  // ── Load current active (non-refunded) tickets for the reservation ─────────

  // Every active ticket, not only the requested types: the minimum-ticket guard
  // below counts the whole reservation.
  const existingActive = await db
    .select()
    .from(schema.tickets)
    .where(
      and(
        eq(schema.tickets.reservationId, id),
        isNull(schema.tickets.refundedAt),
      ),
    )

  // Oldest-first so deletions take the newest rows. Ties broken on id: a batch
  // shares one whole-second `current_timestamp`, so createdAt alone is not total.
  const byType = new Map<string, typeof existingActive>()
  for (const ticket of existingActive.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    if (!byType.has(ticket.ticketTypeId)) byType.set(ticket.ticketTypeId, [])
    byType.get(ticket.ticketTypeId)!.push(ticket)
  }

  // ── Apply diff ────────────────────────────────────────────────────────────

  const toDelete: string[] = []
  const toInsert: Array<{
    reservationId: string
    performanceId: string
    ticketTypeId: string
    pricePaid: number
  }> = []

  for (const { ticketTypeId, quantity } of body.tickets) {
    const current = byType.get(ticketTypeId) ?? []
    const currentCount = current.length

    if (quantity > currentCount) {
      // Need more: insert (quantity - currentCount) rows
      for (let i = 0; i < quantity - currentCount; i++) {
        toInsert.push({
          reservationId: id,
          performanceId,
          ticketTypeId,
          pricePaid: resolveEffectivePrice(ticketTypeId, priceCtx),
        })
      }
    }
    else if (quantity < currentCount) {
      // Need fewer: delete the newest rows first (LIFO)
      const deleteCount = currentCount - quantity
      const toRemove = current.slice(-deleteCount) // newest are last after sort
      toDelete.push(...toRemove.map(t => t.id))
    }
    // quantity === currentCount → no-op
  }

  // A reservation must keep at least one ticket: to remove them all, cancel it.
  // Same rule as the customer route in server/api/bookings/[id]/tickets.put.ts.
  if (existingActive.length + toInsert.length - toDelete.length < 1) {
    throw createError({ statusCode: 400, statusMessage: 'A reservation must have at least one ticket. Cancel it instead.' })
  }

  // Enforce capacity on the net increase before applying. Staff who need to
  // oversell raise the performance's capacityOverride rather than bypassing this.
  await assertCapacity(performanceId, toInsert.length - toDelete.length)

  // Chunked so no statement's parameter count grows with the reservation, and
  // batched so a diff cannot half-apply (ADR-0006).
  const statements = [
    ...chunked(toDelete, IDS_PER_STATEMENT)
      .map(ids => db.delete(schema.tickets).where(inArray(schema.tickets.id, ids))),
    ...chunked(toInsert, TICKET_ROWS_PER_INSERT)
      .map(rows => db.insert(schema.tickets).values(rows)),
  ]

  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])

  // ── Return the updated reservation with full ticket list ───────────────────

  return db.query.reservations.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.id, id),
    with: reservationDetailWith,
  })
})
