import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  sort: z.coerce.number().int().min(0).max(999).optional().default(0),
  colour: z.string().trim().max(20).nullable().optional(),
})

/** POST /api/admin/bar/categories — add a category of things to sell. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  const input = await readValidatedBody(event, bodySchema.parse)
  const [row] = await db.insert(schema.barCategories).values(input).returning()
  return row
})
