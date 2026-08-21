import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
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
    // Identity is central (stage-door ADR-0007): match-or-create a shadow account
    // by email, then mirror the canonical id in the same batch.
    const config = useRuntimeConfig(event)
    if (!config.authServiceToken) {
      throw createError({ statusCode: 502, statusMessage: 'Auth service token not configured' })
    }

    let shadow: { id: string }
    try {
      shadow = await $fetch<{ id: string }>(
        `${config.public.authBaseURL}/api/users/shadow`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.authServiceToken}` },
          body: { email: body.email!, name: body.name! },
        },
      )
    }
    catch (error) {
      console.error('[reservations] shadow-account call failed:', error)
      throw createError({ statusCode: 502, statusMessage: 'Could not reach the auth service — try again' })
    }

    resolvedUserId = shadow.id
    const mirror = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, shadow.id)).get()
    needShadowUser = !mirror
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
  // One statement per chunk: a 20-ticket block booking would otherwise bind
  // 100+ parameters in a single insert, which D1 refuses (ADR-0006).
  const ticketInserts = chunked(ticketRows, TICKET_ROWS_PER_INSERT)
    .map(rows => db.insert(schema.tickets).values(rows))

  if (needShadowUser) {
    await db.batch([
      db.insert(schema.users).values({
        id: resolvedUserId,
        email: body.email!.toLowerCase(),
        name: body.name!,
      }),
      reservationInsert,
      ...ticketInserts,
    ])
  }
  else {
    await db.batch([reservationInsert, ...ticketInserts])
  }

  // Return the full reservation with related data
  return db.query.reservations.findFirst({
    where: (r, { eq }) => eq(r.id, reservationId),
    with: reservationSummaryWith,
  })
})
