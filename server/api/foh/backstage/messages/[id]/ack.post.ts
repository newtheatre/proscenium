import { workFoh } from '~~/shared/utils/abilities'

/** POST /api/foh/backstage/messages/:id/ack: acknowledge a backstage call. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  requireRosteredTonight(scope)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Message ID is required' })

  const night = await ensureNight(scope.night)
  return acknowledgeMessage(night.id, id, user.name, 'FOH')
})
