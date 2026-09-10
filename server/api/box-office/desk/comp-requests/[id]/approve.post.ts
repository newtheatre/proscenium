// Approve a comp request: tonight's duty manager or a ticketing manager, never the requester
// (D-117 criterion 1), claimed atomically so a race between two approvers settles to one.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which request' })

  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const request = await ticketCompRequestById(id, expiryMinutes)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such comp request' })

  const performance = await performanceById(request.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
  const night = performanceNight(performance.startsAt)

  const account = await requireAccount(event)
  if (!await isDutyManagerOrTicketingManager(account.id, night)) {
    throw createError({ statusCode: 403, statusMessage: 'A duty manager or ticketing manager decides a comp request' })
  }

  const refusal = await decideTicketCompRequest(id, account.id, 'APPROVED', null, expiryMinutes)
  if (refusal) throw ticketCompDecisionRefusalError(refusal)

  return { ok: true, request: await ticketCompRequestById(id, expiryMinutes) }
})
