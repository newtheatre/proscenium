import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import { redeemPass } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  performanceId: z.string().min(1),
  /** Staff may override a soft rejection (see STAFF_OVERRIDABLE). */
  override: z.boolean().optional().default(false),
})

/**
 * POST /api/passes/:id/redeem — admit a pass holder to a performance.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, redeemPass)

  const idOrRef = getRouterParam(event, 'id')
  if (!idOrRef) throw createError({ statusCode: 400, statusMessage: 'Pass ID is required' })

  const { performanceId, override } = await readValidatedBody(event, bodySchema.parse)
  const session = await getUserSession(event)

  const pass = await db.select({
    id: schema.passes.id,
    userId: schema.passes.userId,
    reference: schema.passes.reference,
  }).from(schema.passes)
    .where(or(eq(schema.passes.id, idOrRef), eq(schema.passes.reference, idOrRef.toUpperCase())))
    .get()

  if (!pass) throw createError({ statusCode: 404, statusMessage: 'Pass not found' })

  const check = await canRedeem(pass.id, performanceId)
  if (!check.ok) {
    const overridable = check.reason && STAFF_OVERRIDABLE.includes(check.reason)
    if (!(override && overridable)) {
      throw createError({
        statusCode: 409,
        statusMessage: check.message ?? 'This pass cannot be used for this performance',
        data: { reason: check.reason, overridable },
      })
    }
  }

  const ticketTypeId = await getPassAdmissionTicketTypeId()

  // Admit against an existing reservation for this holder and performance if
  // there is one — the door list should show one party, not two.
  const existingReservation = await db.select({ id: schema.reservations.id })
    .from(schema.reservations)
    .where(and(
      eq(schema.reservations.userId, pass.userId),
      eq(schema.reservations.performanceId, performanceId),
      inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
    ))
    .get()

  const reservationId = existingReservation?.id ?? nanoid()
  const ticketId = nanoid()

  const ticketInsert = db.insert(schema.tickets).values({
    id: ticketId,
    reservationId,
    performanceId,
    ticketTypeId,
    pricePaid: 0,
  })
  const admissionInsert = db.insert(schema.passAdmissions).values({
    passId: pass.id,
    ticketId,
    performanceId,
    redeemedByUserId: session.user?.id ?? null,
  })

  if (existingReservation) {
    await db.batch([ticketInsert, admissionInsert])
  }
  else {
    await db.batch([
      db.insert(schema.reservations).values({
        id: reservationId,
        performanceId,
        userId: pass.userId,
        status: 'DOOR',
        source: 'DOOR',
        staffNotes: `Pass admission — ${pass.reference}`,
      }),
      ticketInsert,
      admissionInsert,
    ])
  }

  return { admitted: true, passReference: pass.reference, reservationId, ticketId }
})
