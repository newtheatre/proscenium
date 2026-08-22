import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({ since: z.coerce.number().int().min(0).optional() })

/** GET /api/foh/backstage/board: the front-of-house side of the board. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const { since } = await getValidatedQuery(event, querySchema.parse)

  const night = await ensureNight(scope.night)
  const [messages, presets, timings] = await Promise.all([
    messagesSince(night.id, since),
    listPresets('FOH'),
    curtainTimings(night.id),
  ])

  return { night: night.night, messages, presets, timings, serverTime: Date.now() }
})
