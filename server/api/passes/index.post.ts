import { db, schema } from '@nuxthub/db'
import { and, count, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod/v4'
import { issuePass } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  passTypeId: z.string().min(1),
  passTypePriceId: z.string().min(1),

  // Either an existing account, or name + email for a find-or-create — the same
  // shadow-account path a walk-in booking uses.
  userId: z.string().optional(),
  name: z.string().min(1).optional(),
  email: z.email().optional(),

  /** Link the sale to the door transaction it happened alongside. */
  reservationId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(d => d.userId || (d.name && d.email), {
  message: 'Either userId or both name and email are required',
})

/** POST /api/passes — sell a pass. Staff only. */
export default defineEventHandler(async (event) => {
  await authorize(event, issuePass)

  const body = await readValidatedBody(event, bodySchema.parse)
  const session = await getUserSession(event)

  const passType = await db.select().from(schema.passTypes)
    .where(eq(schema.passTypes.id, body.passTypeId)).get()
  if (!passType) throw createError({ statusCode: 404, statusMessage: 'Pass type not found' })
  if (passType.status !== 'ON_SALE') {
    throw createError({ statusCode: 400, statusMessage: 'This pass is not on sale' })
  }

  const now = new Date()
  if (passType.salesOpenAt && now < passType.salesOpenAt) {
    throw createError({ statusCode: 400, statusMessage: 'This pass is not on sale yet' })
  }
  if (passType.salesCloseAt && now > passType.salesCloseAt) {
    throw createError({ statusCode: 400, statusMessage: 'Sales for this pass have closed' })
  }

  const price = await db.select().from(schema.passTypePrices)
    .where(and(
      eq(schema.passTypePrices.id, body.passTypePriceId),
      eq(schema.passTypePrices.passTypeId, body.passTypeId),
    )).get()
  if (!price) throw createError({ statusCode: 400, statusMessage: 'That price does not belong to this pass type' })
  if (!price.active) throw createError({ statusCode: 400, statusMessage: 'That price is no longer available' })

  // maxIssued is the blunt protection against selling more passes than the
  // house can seat. Read-then-write, like capacity — acceptable at this volume.
  if (passType.maxIssued != null) {
    const [issued] = await db.select({ n: count() }).from(schema.passes)
      .where(and(
        eq(schema.passes.passTypeId, body.passTypeId),
        eq(schema.passes.status, 'ACTIVE'),
      ))
    if ((issued?.n ?? 0) >= passType.maxIssued) {
      throw createError({ statusCode: 409, statusMessage: 'This pass has sold out' })
    }
  }

  // ── Resolve the holder ────────────────────────────────────────────────────
  let userId: string
  let needShadowUser = false

  if (body.userId) {
    const existing = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.id, body.userId)).get()
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'User not found' })
    userId = existing.id
  }
  else {
    // Identity is central (stage-door ADR-0007): match-or-create a shadow
    // account by email in the auth service, mirror the canonical id locally
    // in the batch below.
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
      console.error('[passes] shadow-account call failed:', error)
      throw createError({ statusCode: 502, statusMessage: 'Could not reach the auth service — try again' })
    }
    userId = shadow.id
    const mirror = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.id, shadow.id)).get()
    needShadowUser = !mirror
  }

  const passId = nanoid()
  const passInsert = db.insert(schema.passes).values({
    id: passId,
    passTypeId: body.passTypeId,
    passTypePriceId: price.id,
    userId,
    status: 'ACTIVE',
    pricePaid: price.price,
    issuedByUserId: session.user?.id ?? null,
    reservationId: body.reservationId || null,
    notes: body.notes ?? null,
  })

  if (needShadowUser) {
    await db.batch([
      db.insert(schema.users).values({
        id: userId, email: body.email!.toLowerCase(), name: body.name!,
      }),
      passInsert,
    ])
  }
  else {
    await passInsert
  }

  const created = await db.select({
    id: schema.passes.id,
    reference: schema.passes.reference,
    pricePaid: schema.passes.pricePaid,
  }).from(schema.passes).where(eq(schema.passes.id, passId)).get()

  return created
})
