import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
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
 * PUT /api/pass-types/:id — edit a pass product, including putting it on sale.
 * Admin/Manager only.
 *
 * This route is what makes passes sellable at all. `POST /api/pass-types`
 * creates every product as DRAFT, the box office only offers types whose status
 * is ON_SALE, and nothing else in the app writes `passTypes.status` — so before
 * this existed, the empty state in the Sell tab ("A pass type must be set to
 * ON_SALE in the admin area before it can be sold") pointed at a control that
 * did not exist, and the whole passes feature was unreachable end to end.
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
  // Whole days in Europe/London, matching the create route — see
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

  // Putting a product on sale is the point at which its scope has to be real:
  // a pass covering no shows is redeemable nowhere, and the volunteer holding
  // it at the door gets SHOW_NOT_COVERED with no way to tell it was a setup
  // mistake rather than the customer's.
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

  // Lowering maxIssued below what has already been issued would leave the cap
  // permanently breached and silently block nothing — the check in
  // POST /api/passes compares against ACTIVE passes.
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
