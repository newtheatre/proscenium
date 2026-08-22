import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Percentage only, and bar lines only. Never touches a ticket (docs/13 §4.1.1). */
  percent: z.coerce.number().int().min(1).max(100),
  sort: z.coerce.number().int().min(0).max(999).optional().default(0),
})

/** POST /api/admin/bar/discounts: add a discount the till can offer. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  const input = await readValidatedBody(event, bodySchema.parse)
  const [row] = await db.insert(schema.barDiscounts).values(input).returning()
  return row
})
