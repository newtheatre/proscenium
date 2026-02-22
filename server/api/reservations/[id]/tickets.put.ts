import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod/v4'
import { reservations, tickets, ticketTypes, showTicketTypeOverrides, performanceTicketTypeOverrides, performances } from 'hub:db:schema'
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
})

export default defineEventHandler(async (event) => {
  await authorize(event, updateReservation)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const body = await readValidatedBody(event, bodySchema.parse)

  // ── Load reservation + performance/show context ────────────────────────────

  const reservation = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id))
    .get()

  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })

  const { performanceId } = reservation

  // Resolve showId from the performance
  const perf = await db
    .select({ showId: performances.showId })
    .from(performances)
    .where(eq(performances.id, performanceId))
    .get()

  if (!perf) throw createError({ statusCode: 500, statusMessage: 'Performance not found' })
  const showId = perf.showId

  const requestedTypeIds = body.tickets.map(t => t.ticketTypeId)

  // ── Validate all requested ticket types exist ──────────────────────────────

  const baseTypes = await db
    .select()
    .from(ticketTypes)
    .where(inArray(ticketTypes.id, requestedTypeIds))

  const missingTypeId = requestedTypeIds.find(id => !baseTypes.find(t => t.id === id))
  if (missingTypeId) {
    throw createError({ statusCode: 400, statusMessage: `Ticket type ${missingTypeId} not found` })
  }

  // ── Resolve effective prices ───────────────────────────────────────────────

  const [showOverrides, perfOverrides] = await Promise.all([
    db.select().from(showTicketTypeOverrides).where(
      and(
        eq(showTicketTypeOverrides.showId, showId),
        inArray(showTicketTypeOverrides.ticketTypeId, requestedTypeIds),
      ),
    ),
    db.select().from(performanceTicketTypeOverrides).where(
      and(
        eq(performanceTicketTypeOverrides.performanceId, performanceId),
        inArray(performanceTicketTypeOverrides.ticketTypeId, requestedTypeIds),
      ),
    ),
  ])

  function effectivePrice(ticketTypeId: string): number {
    const perfOv = perfOverrides.find(o => o.ticketTypeId === ticketTypeId)
    if (perfOv?.price != null) return perfOv.price
    const showOv = showOverrides.find(o => o.ticketTypeId === ticketTypeId)
    if (showOv?.price != null) return showOv.price
    return baseTypes.find(t => t.id === ticketTypeId)!.price
  }

  // ── Load current active (non-refunded) tickets for the reservation ─────────

  const existingActive = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.reservationId, id),
        isNull(tickets.refundedAt),
        inArray(tickets.ticketTypeId, requestedTypeIds),
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
          pricePaid: effectivePrice(ticketTypeId),
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

  // Execute mutations
  if (toDelete.length > 0) {
    await db.delete(tickets).where(inArray(tickets.id, toDelete))
  }
  if (toInsert.length > 0) {
    await db.insert(tickets).values(toInsert)
  }

  // ── Return the updated reservation with full ticket list ───────────────────

  return db.query.reservations.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.id, id),
    with: {
      user: { columns: { id: true, name: true, email: true, password: false, verified: true } },
      performance: {
        with: {
          show: { columns: { id: true, title: true, slug: true } },
          venue: { columns: { id: true, name: true } },
        },
      },
      tickets: {
        with: {
          ticketType: { columns: { id: true, name: true, description: true } },
        },
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      },
    },
  })
})
