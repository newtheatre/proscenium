import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { issuePass } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  /** Which price was actually charged: the one on the day, not the quote. */
  passTypePriceId: z.string().trim().min(1),
  notes: z.string().trim().max(300).nullable().optional(),
})

/**
 * POST /api/pass-requests/:id/fulfil: the money has been taken in person, so
 * the pass exists now and not before (ADR-0028).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, issuePass)

  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)
  const session = await getUserSession(event)

  const request = await db.select({
    id: schema.passRequests.id,
    status: schema.passRequests.status,
    passTypeId: schema.passRequests.passTypeId,
    userId: schema.passRequests.userId,
  }).from(schema.passRequests).where(eq(schema.passRequests.id, id)).get()

  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such request.' })
  if (request.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: `That request was already ${request.status.toLowerCase()}.` })
  }

  // The same guards the direct sale applies: fulfilling a queue is still a
  // sale, and maxIssued is what stops it overselling the house (ADR-0028).
  const { price } = await assertPassSellable(request.passTypeId, input.passTypePriceId)

  const passId = nanoid()
  await db.batch([
    db.insert(schema.passes).values({
      id: passId,
      passTypeId: request.passTypeId,
      passTypePriceId: price.id,
      userId: request.userId,
      pricePaid: price.price,
      issuedByUserId: session.user?.id ?? null,
      notes: input.notes ?? null,
    }),
    db.update(schema.passRequests).set({
      status: 'FULFILLED',
      decidedByUserId: session.user?.id ?? null,
      decidedAt: sql`(current_timestamp)`,
      passId,
    }).where(eq(schema.passRequests.id, id)),
  ])

  const created = await db.select({ reference: schema.passes.reference })
    .from(schema.passes).where(eq(schema.passes.id, passId)).get()

  return { id, status: 'FULFILLED', passId, reference: created?.reference ?? null }
})
