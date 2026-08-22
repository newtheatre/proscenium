import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sort: z.coerce.number().int().min(0).max(999).optional(),
  colour: z.string().trim().max(30).nullable().optional(),
})

/** PATCH /api/admin/bar/categories/:id. Rename or reorder. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)

  const category = await db.select({ id: schema.barCategories.id })
    .from(schema.barCategories).where(eq(schema.barCategories.id, id)).get()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'No such category.' })

  await db.update(schema.barCategories).set(input).where(eq(schema.barCategories.id, id))
  return { ok: true }
})
