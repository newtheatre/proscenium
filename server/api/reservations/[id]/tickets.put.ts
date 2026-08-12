import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateReservation } from '~~/shared/utils/abilities'

/**
 * PUT /api/reservations/:id/tickets
 *
 * Adjusts the active (non-refunded) ticket composition of a reservation.
 *
 * The caller specifies the **desired total quantity** of each ticket type.
 * The server diffs against the current active state and INSERTs or DELETEs rows.
 *
 * - Increasing quantity: INSERTs new rows, resolving pricePaid via the current
 *   override chain (performance → show → base).
 * - Decreasing quantity: DELETEs the newest rows first (LIFO).
 * - Setting quantity to 0: DELETEs all active rows for that type.
 * - Ticket types omitted from the body are left untouched.
 * - Refunded tickets (refundedAt IS NOT NULL) are never touched.
 */
const bodySchema = z.object({
  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.int().min(0).max(50),
  })).min(1),
}).refine(
  // The handler treats each entry as the desired TOTAL for that type and reads
  // the current count from a map it never updates, so two entries for one type
  // each computed against the original count and the quantities compounded —
  // "10 then 10" inserted 20. A repeated type is a client bug either way.
  data => new Set(data.tickets.map(t => t.ticketTypeId)).size === data.tickets.length,
  { message: 'Each ticket type may only appear once' },
)

/** PUT /api/reservations/:id/tickets — update ticket quantities on a reservation. Staff only. */
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

  // Collected tickets are a record of a completed transaction, not a working
  // draft: changing them here would delete paid-for tickets with nothing to show
  // that anything was returned. After collection the only route is a refund.
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

  const existingActive = await db
    .select()
    .from(schema.tickets)
    .where(
      and(
        eq(schema.tickets.reservationId, id),
        isNull(schema.tickets.refundedAt),
        inArray(schema.tickets.ticketTypeId, requestedTypeIds),
      ),
    )

  // Group by ticketTypeId, sorted oldest-first (so deletions take newest rows)
  const byType = new Map<string, typeof existingActive>()
  for (const ticket of existingActive.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))) {
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
      // Need more — insert (quantity - currentCount) rows
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
      // Need fewer — delete the newest rows first (LIFO)
      const deleteCount = currentCount - quantity
      const toRemove = current.slice(-deleteCount) // newest are last after sort
      toDelete.push(...toRemove.map(t => t.id))
    }
    // quantity === currentCount → no-op
  }

  // Enforce capacity on the net increase before applying. Staff who need to
  // oversell raise the performance's capacityOverride rather than bypassing this.
  await assertCapacity(performanceId, toInsert.length - toDelete.length)

  // Execute mutations atomically so a diff can't half-apply (deletions land but
  // insertions fail, or vice versa).
  const del = toDelete.length > 0
    ? db.delete(schema.tickets).where(inArray(schema.tickets.id, toDelete))
    : null
  const ins = toInsert.length > 0
    ? db.insert(schema.tickets).values(toInsert)
    : null

  if (del && ins) await db.batch([del, ins])
  else if (del) await del
  else if (ins) await ins

  // ── Return the updated reservation with full ticket list ───────────────────

  return db.query.reservations.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.id, id),
    with: reservationDetailWith,
  })
})
