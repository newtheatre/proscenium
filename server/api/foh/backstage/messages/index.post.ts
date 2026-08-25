import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  presetId: z.string().trim().min(1).optional(),
  body: z.string().trim().max(500).optional(),
})

/** POST /api/foh/backstage/messages: call something through to backstage. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  requireRosteredTonight(scope)
  const input = await readValidatedBody(event, bodySchema.parse)
  const night = await ensureNight(scope.night)

  return sendBoardMessage({
    nightId: night.id,
    direction: 'FOH',
    presetId: input.presetId,
    body: input.body,
    sender: { userId: user.id, name: user.name },
  })
})
