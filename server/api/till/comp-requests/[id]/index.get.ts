// A single request's status, for the till to poll while it waits to be decided (Stream 6 A10):
// the same read the queue itself carries, without the queue's stricter decide-only authority.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Say which request you mean' })

  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const request = await compRequestById(id, expiryMinutes)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such comp request' })

  await requireNightAuthority(event, 'BAR', { venueId: request.venueId })

  return { ok: true, request }
})
