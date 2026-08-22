import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  passTypeId: z.string().trim().min(1),
  /** Which advertised price they were shown, for the record (ADR-0028). */
  passTypePriceId: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
})

/** POST /api/passes/mine/requests — ask for a pass. Creates no pass (ADR-0028). */
export default defineEventHandler(async (event) => {
  const { id: userId } = await requireSessionUser(event)
  const input = await readValidatedBody(event, bodySchema.parse)

  const passType = await db.select({
    id: schema.passTypes.id,
    status: schema.passTypes.status,
    salesOpenAt: schema.passTypes.salesOpenAt,
    salesCloseAt: schema.passTypes.salesCloseAt,
  }).from(schema.passTypes).where(eq(schema.passTypes.id, input.passTypeId)).get()

  if (!passType) throw createError({ statusCode: 404, statusMessage: 'No such pass.' })

  // The same sale window the box office is held to (docs/10 §4).
  const now = new Date()
  const open = passType.status === 'ON_SALE'
    && (!passType.salesOpenAt || now >= passType.salesOpenAt)
    && (!passType.salesCloseAt || now <= passType.salesCloseAt)
  if (!open) throw createError({ statusCode: 409, statusMessage: 'That pass is not on sale at the moment.' })

  const existing = await db.select({ id: schema.passRequests.id })
    .from(schema.passRequests)
    .where(and(
      eq(schema.passRequests.userId, userId),
      eq(schema.passRequests.passTypeId, input.passTypeId),
      eq(schema.passRequests.status, 'PENDING'),
    ))
    .get()
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'You have already asked for this pass. The box office will have it ready.' })
  }

  const quoted = input.passTypePriceId
    ? await db.select({ price: schema.passTypePrices.price })
        .from(schema.passTypePrices)
        .where(and(
          eq(schema.passTypePrices.id, input.passTypePriceId),
          eq(schema.passTypePrices.passTypeId, input.passTypeId),
        ))
        .get()
    : null

  const [created] = await db.insert(schema.passRequests).values({
    passTypeId: input.passTypeId,
    userId,
    quotedPence: quoted?.price ?? null,
    note: input.note ?? null,
  }).returning({ id: schema.passRequests.id })

  return { id: created!.id, status: 'PENDING' }
})
