import { z } from 'zod'
import { listShifts } from '~~/shared/utils/abilities'

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional().default(DUTY_MANAGER_WARNING_DAYS),
})

/** GET /api/shifts/unstaffed — performances soon with no confirmed duty manager. */
export default defineEventHandler(async (event) => {
  await authorize(event, listShifts)

  const { days } = await getValidatedQuery(event, querySchema.parse)
  return performancesMissingDutyManager(days)
})
