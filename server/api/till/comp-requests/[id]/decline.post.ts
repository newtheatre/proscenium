import { declineCompRequestForm } from '#shared/utils/comps'

// Decline a comp request, with a reason on the record: the same authority as approval, since
// deciding either way is the same conflict of interest for the requester (F-110 criterion 1).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, declineCompRequestForm)
  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const request = await requestedCompRequest(getRouterParam(event, 'id'), expiryMinutes)

  // Establishes that the caller is legitimately on tonight's till or duty roster at all
  // (E-111 criterion 5); deciding itself needs the stricter check below.
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'BAR'], { venueId: request.venueId })
  await requireCompDecider(resolved.account.id, request)

  const refusal = await decideCompRequest(request.id, resolved.account.id, 'DECLINED', input.reason, expiryMinutes)
  if (refusal) throw compDecisionRefusalError(refusal)

  return { ok: true, request: await compRequestById(request.id, expiryMinutes) }
})
