import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({ performanceId: z.string().trim().min(1) })

/**
 * GET /api/foh/access-tonight: consented needs for this performance. Empty
 * rather than 403: an empty list does not advertise that there was something.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const { performanceId } = await getValidatedQuery(event, querySchema.parse)
  scopedPerformance(scope, performanceId)

  return accessTonight(user, performanceId)
})
