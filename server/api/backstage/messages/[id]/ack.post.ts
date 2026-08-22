/** POST /api/backstage/messages/:id/ack: acknowledge an FOH call. */
export default defineEventHandler(async (event) => {
  const session = await requireBackstageSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Message ID is required' })

  return acknowledgeMessage(session.nightId, id, session.deviceName ?? 'Backstage', 'BACKSTAGE')
})
