// What the requester's own screen polls to see the outcome (D-117 criterion 5): approved,
// declined and why, or still pending. Desk access is enough to read it; only deciding is gated.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.write')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Say which request you mean' })

  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const request = await ticketCompRequestById(id, expiryMinutes)
  if (!request) throw noSuch('comp request')

  return { request }
})
