import { declineCompRequestForm } from '#shared/utils/comps'

// Decline a comp request, with a reason on the record: the same authority as approval, since
// deciding either way is the same conflict of interest for the requester (F-110 criterion 1).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, declineCompRequestForm)
  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const { request, deciderId } = await resolveCompDecision(event, getRouterParam(event, 'id'), expiryMinutes)

  const refusal = await decideCompRequest(request.id, deciderId, 'DECLINED', input.reason, expiryMinutes)
  if (refusal) throw compDecisionRefusalError(refusal)

  return { ok: true, request: await compRequestById(request.id, expiryMinutes) }
})
