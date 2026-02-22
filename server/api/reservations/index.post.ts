import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod/v4'
import { users, reservations, tickets, ticketTypes, showTicketTypeOverrides, performanceTicketTypeOverrides } from 'hub:db:schema'
import { createReservation } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  performanceId: z.string().min(1),

  // Either userId (existing account) or name + email (finds/creates shadow account)
  userId: z.string().optional(),
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  phone: z.string().optional(),

  // Tickets to book: each entry creates `quantity` individual ticket rows
  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.int().min(1).max(20),
  })).min(1, 'At least one ticket is required'),

  customerNotes: z.string().optional(),
  staffNotes: z.string().optional(),
}).refine(
  data => data.userId || (data.name && data.email),
  { message: 'Either userId or both name and email are required' },
)

export default defineEventHandler(async (event) => {
  await authorize(event, createReservation)

  const body = await readValidatedBody(event, bodySchema.parse)

  // ── Validate performance ───────────────────────────────────────────────────

  const performance = await db.query.performances.findFirst({
    where: (p, { eq }) => eq(p.id, body.performanceId),
    with: { show: { columns: { id: true } } },
  })

  if (!performance) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  }

  // Allow staff to book into non-ON_SALE performances (DRAFT/CANCELLED) with a warning
  // but not into a non-existent show

  // ── Resolve user ───────────────────────────────────────────────────────────

  let resolvedUserId: string

  if (body.userId) {
    const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.id, body.userId)).get()
    if (!existingUser) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }
    resolvedUserId = existingUser.id
  }
  else {
    // Find existing account (full or shadow) by email, or create a shadow account
    const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email!)).get()

    if (existingUser) {
      resolvedUserId = existingUser.id
    }
    else {
      // Create shadow account — no password set; they can claim it later via password reset
      const [shadowUser] = await db.insert(users).values({
        email: body.email!,
        name: body.name!,
        password: null,
        verified: false,
      }).returning({ id: users.id })

      if (!shadowUser) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to create guest account' })
      }
      resolvedUserId = shadowUser.id
    }
  }

  // ── Resolve effective ticket prices ───────────────────────────────────────

  const requestedTypeIds = body.tickets.map(t => t.ticketTypeId)

  const [baseTypes, showOverrides, perfOverrides] = await Promise.all([
    db.select().from(ticketTypes).where(inArray(ticketTypes.id, requestedTypeIds)),
    db.select().from(showTicketTypeOverrides).where(
      and(
        eq(showTicketTypeOverrides.showId, performance.show.id),
        inArray(showTicketTypeOverrides.ticketTypeId, requestedTypeIds),
      ),
    ),
    db.select().from(performanceTicketTypeOverrides).where(
      and(
        eq(performanceTicketTypeOverrides.performanceId, body.performanceId),
        inArray(performanceTicketTypeOverrides.ticketTypeId, requestedTypeIds),
      ),
    ),
  ])

  function effectivePrice(ticketTypeId: string): number {
    const perfOverride = perfOverrides.find(o => o.ticketTypeId === ticketTypeId)
    if (perfOverride?.price != null) return perfOverride.price

    const showOverride = showOverrides.find(o => o.ticketTypeId === ticketTypeId)
    if (showOverride?.price != null) return showOverride.price

    const base = baseTypes.find(t => t.id === ticketTypeId)
    if (!base) throw createError({ statusCode: 400, statusMessage: `Ticket type ${ticketTypeId} not found` })
    return base.price
  }

  // Validate all requested ticket types exist
  for (const { ticketTypeId } of body.tickets) {
    if (!baseTypes.find(t => t.id === ticketTypeId)) {
      throw createError({ statusCode: 400, statusMessage: `Ticket type ${ticketTypeId} not found` })
    }
  }

  // ── Create reservation + tickets ──────────────────────────────────────────

  const [reservation] = await db.insert(reservations).values({
    performanceId: body.performanceId,
    userId: resolvedUserId,
    customerNotes: body.customerNotes ?? null,
    staffNotes: body.staffNotes ?? null,
    status: 'PENDING',
  }).returning()

  if (!reservation) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create reservation' })
  }

  // Expand quantities into individual ticket rows
  const ticketRows = body.tickets.flatMap(({ ticketTypeId, quantity }) =>
    Array.from({ length: quantity }, () => ({
      reservationId: reservation.id,
      performanceId: body.performanceId,
      ticketTypeId,
      pricePaid: effectivePrice(ticketTypeId),
    })),
  )

  await db.insert(tickets).values(ticketRows)

  // Return the full reservation with related data
  return db.query.reservations.findFirst({
    where: (r, { eq }) => eq(r.id, reservation.id),
    with: {
      user: { columns: { id: true, name: true, email: true, password: false, verified: true } },
      performance: {
        with: {
          show: { columns: { id: true, title: true, slug: true } },
          venue: { columns: { id: true, name: true } },
        },
      },
    },
  })
})
