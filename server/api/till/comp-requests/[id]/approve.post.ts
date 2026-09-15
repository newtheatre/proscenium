// Approve a comp request: tonight's duty manager or the bar manager, never the requester
// (F-110 criterion 1), claimed atomically so a race between two approvers settles to one.
export default defineEventHandler(async (event) => {
  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const { request, deciderId } = await resolveCompDecision(event, getRouterParam(event, 'id'), expiryMinutes)

  const refusal = await decideCompRequest(request.id, deciderId, 'APPROVED', null, expiryMinutes)
  if (refusal) throw compDecisionRefusalError(refusal)

  return { ok: true, request: await compRequestById(request.id, expiryMinutes) }
})
