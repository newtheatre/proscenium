import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  passId: z.string().trim().min(1),
  performanceId: z.string().trim().min(1),
})

/** POST /api/passes/mine/redeem — book a seat on your own pass (docs/10 §4). */
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireSessionUser(event)
  const input = await readValidatedBody(event, bodySchema.parse)

  const pass = await db.select({
    id: schema.passes.id,
    userId: schema.passes.userId,
    reference: schema.passes.reference,
  }).from(schema.passes).where(eq(schema.passes.id, input.passId)).get()

  // Not 403: a holder should not be able to probe for other people's passes.
  if (!pass || pass.userId !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'That pass is not on your account.' })
  }

  // The one validation rule, shared with the door (docs/10 §4).
  const check = await canRedeem(pass.id, input.performanceId)
  if (!check.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: check.message ?? 'This pass cannot be used for this performance.',
      data: { reason: check.reason },
    })
  }

  const { reservationId, joinedExisting } = await admitOnPass({
    passId: pass.id,
    holderUserId: userId,
    performanceId: input.performanceId,
    // Nobody else acted: the holder redeemed it themselves.
    redeemedByUserId: null,
    source: 'WEB',
    status: 'PENDING',
    staffNote: `Pass admission — ${pass.reference}`,
  })

  return { reservationId, joinedExisting }
})
