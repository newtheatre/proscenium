import { db, schema } from '@nuxthub/db'
import { eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { redeemPass } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  performanceId: z.string().min(1),
  /** Staff may override a soft rejection (see STAFF_OVERRIDABLE). */
  override: z.boolean().optional().default(false),
})

/**
 * POST /api/passes/:id/redeem: admit a pass holder to a performance.
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

  const { reservationId, ticketId } = await admitOnPass({
    passId: pass.id,
    holderUserId: pass.userId,
    performanceId,
    redeemedByUserId: session.user?.id ?? null,
    source: 'DOOR',
    status: 'DOOR',
    staffNote: `Pass admission, ${pass.reference}`,
  })

  return { admitted: true, passReference: pass.reference, reservationId, ticketId }
})
