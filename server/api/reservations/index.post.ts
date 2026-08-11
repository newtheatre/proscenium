import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
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

/** POST /api/reservations — create a new reservation. Staff only. */
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
  let needShadowUser = false

  if (body.userId) {
    const existingUser = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, body.userId)).get()
    if (!existingUser) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }
    resolvedUserId = existingUser.id
  }
  else {
    // Find existing account (full or shadow) by email, or create a shadow account
    const existingUser = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, body.email!)).get()

    if (existingUser) {
      resolvedUserId = existingUser.id
    }
    else {
      // Create a shadow account — no password set; they can claim it later via
      // password reset. Deferred so it goes in the same atomic batch below.
      resolvedUserId = nanoid()
      needShadowUser = true
    }
  }

  // ── Resolve effective ticket prices ───────────────────────────────────────

  const requestedTypeIds = body.tickets.map(t => t.ticketTypeId)
  const priceCtx = await loadTicketPriceContext(requestedTypeIds, performance.show.id, body.performanceId)
  validateTicketTypesExist(requestedTypeIds, priceCtx)

  // Enforce capacity on the walk-in path too. Staff who need to oversell raise
  // the performance's capacityOverride rather than bypassing this.
  const totalRequested = body.tickets.reduce((sum, t) => sum + t.quantity, 0)
  await assertCapacity(body.performanceId, totalRequested)

  // ── Create shadow user (if needed) + reservation + tickets, atomically ─────

  const reservationId = nanoid()

  // Expand quantities into individual ticket rows
  const ticketRows = body.tickets.flatMap(({ ticketTypeId, quantity }) =>
    Array.from({ length: quantity }, () => ({
      reservationId,
      performanceId: body.performanceId,
      ticketTypeId,
      pricePaid: resolveEffectivePrice(ticketTypeId, priceCtx),
    })),
  )

  const reservationInsert = db.insert(schema.reservations).values({
    id: reservationId,
    performanceId: body.performanceId,
    userId: resolvedUserId,
    customerNotes: body.customerNotes ?? null,
    staffNotes: body.staffNotes ?? null,
    status: 'PENDING',
  })
  const ticketsInsert = db.insert(schema.tickets).values(ticketRows)

  if (needShadowUser) {
    await db.batch([
      db.insert(schema.users).values({
        id: resolvedUserId,
        email: body.email!,
        name: body.name!,
        password: null,
        verified: false,
      }),
      reservationInsert,
      ticketsInsert,
    ])
  }
  else {
    await db.batch([reservationInsert, ticketsInsert])
  }

  // Return the full reservation with related data
  return db.query.reservations.findFirst({
    where: (r, { eq }) => eq(r.id, reservationId),
    with: reservationSummaryWith,
  })
})
