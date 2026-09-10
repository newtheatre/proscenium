import { declineTicketCompRequestForm } from '#shared/utils/ticket-comps'

// Decline a comp request: the same authority as approving it (D-117 criterion 5), with a
// reason on the record so the requester sees why, never a bare refusal.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which request' })
  const input = await readValidatedBodyOrThrow(event, declineTicketCompRequestForm)

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

  const refusal = await decideTicketCompRequest(id, account.id, 'DECLINED', input.reason, expiryMinutes)
  if (refusal) throw ticketCompDecisionRefusalError(refusal)

  return { ok: true, request: await ticketCompRequestById(id, expiryMinutes) }
})
