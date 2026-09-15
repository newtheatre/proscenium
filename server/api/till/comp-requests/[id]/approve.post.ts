// Approve a comp request: tonight's duty manager or the bar manager, never the requester
// (F-110 criterion 1), claimed atomically so a race between two approvers settles to one.
export default defineEventHandler(async (event) => {
  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const request = await requestedCompRequest(getRouterParam(event, 'id'), expiryMinutes)

  // Establishes that the caller is legitimately on tonight's till or duty roster at all
  // (E-111 criterion 5); deciding itself needs the stricter check below.
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'BAR'], { venueId: request.venueId })
  await requireCompDecider(resolved.account.id, request)

  const refusal = await decideCompRequest(request.id, resolved.account.id, 'APPROVED', null, expiryMinutes)
  if (refusal) throw compDecisionRefusalError(refusal)

  return { ok: true, request: await compRequestById(request.id, expiryMinutes) }
})
