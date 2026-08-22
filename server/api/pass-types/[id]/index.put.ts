import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { managePassTypes } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  status: z.enum(['DRAFT', 'ON_SALE', 'CLOSED']).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  maxIssued: z.int().min(1).optional().nullable(),
  transferable: z.boolean().optional(),
  validFrom: z.string().min(1).optional(),
  validTo: z.string().min(1).optional(),
})

/**
 * PUT /api/pass-types/:id. Edit a pass product, including putting it on
 * sale.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, managePassTypes)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Pass type ID is required' })

  const existing = await db.select().from(schema.passTypes)
    .where(eq(schema.passTypes.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Pass type not found' })

  const body = await readValidatedBody(event, bodySchema.parse)

  const update: Partial<typeof schema.passTypes.$inferInsert> = {}
  if (body.name !== undefined) update.name = body.name
  if (body.description !== undefined) update.description = body.description ?? null
  if (body.maxIssued !== undefined) update.maxIssued = body.maxIssued ?? null
  if (body.transferable !== undefined) update.transferable = body.transferable
  // Whole days in Europe/London, matching the create route: see
  // server/utils/validityWindow.ts.
  if (body.validFrom !== undefined) update.validFrom = validityStart(body.validFrom)
  if (body.validTo !== undefined) update.validTo = validityEnd(body.validTo)
  if (body.status !== undefined) update.status = body.status

  const validFrom = update.validFrom ?? existing.validFrom
  const validTo = update.validTo ?? existing.validTo
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'validFrom and validTo must be valid dates' })
  }
  if (validTo < validFrom) {
    throw createError({ statusCode: 400, statusMessage: 'validTo must be on or after validFrom' })
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields provided for update' })
  }

  // Putting a product on sale is where its scope has to be real: a pass covering
  // no shows is redeemable nowhere.
  if (body.status === 'ON_SALE' && existing.status !== 'ON_SALE') {
    const [scope] = await db.select({ n: count() })
      .from(schema.passTypeShows)
      .where(eq(schema.passTypeShows.passTypeId, id))
    if (!scope?.n) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This pass covers no shows yet, so it could not be redeemed anywhere. Add shows to its scope before putting it on sale.',
      })
    }
  }

  // Lowering maxIssued below what is already issued would leave the cap
  // permanently breached and block nothing.
  if (update.maxIssued != null) {
    const [issued] = await db.select({ n: count() })
      .from(schema.passes)
      .where(eq(schema.passes.passTypeId, id))
    if ((issued?.n ?? 0) > update.maxIssued) {
      throw createError({
        statusCode: 409,
        statusMessage: `${issued?.n} passes of this type have already been issued, so the cap cannot be set to ${update.maxIssued}.`,
      })
    }
  }

  const [updated] = await db.update(schema.passTypes)
    .set(update)
    .where(eq(schema.passTypes.id, id))
    .returning()

  return updated
})
