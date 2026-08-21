import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const querySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** GET /api/admin/bar/reconciliation — what the reader's Z should read. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const { day } = await getValidatedQuery(event, querySchema.parse)
  return reconciliation(day ?? londonDate())
})
