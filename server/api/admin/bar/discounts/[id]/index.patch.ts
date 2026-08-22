import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  percent: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'RETIRED']).optional(),
  sort: z.coerce.number().int().min(0).max(999).optional(),
})

/**
 * PATCH /api/admin/bar/discounts/:id. Edit or retire. Past transactions keep
 * the percent they were rung up at, so changing this is not retrospective.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)

  const discount = await db.select({ id: schema.barDiscounts.id })
    .from(schema.barDiscounts).where(eq(schema.barDiscounts.id, id)).get()
  if (!discount) throw createError({ statusCode: 404, statusMessage: 'No such discount.' })

  await db.update(schema.barDiscounts).set(input).where(eq(schema.barDiscounts.id, id))
  return { ok: true }
})
