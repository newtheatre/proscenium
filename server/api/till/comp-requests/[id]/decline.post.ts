import { declineCompRequestForm } from '#shared/utils/comps'

// Decline a comp request, with a reason on the record: the same authority as approval, since
// deciding either way is the same conflict of interest for the requester (F-110 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which request' })
  const input = await readValidatedBodyOrThrow(event, declineCompRequestForm)

  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const request = await compRequestById(id, expiryMinutes)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such comp request' })

  // Establishes that the caller is legitimately on tonight's till or duty roster at all
  // (E-111 criterion 5); deciding itself needs the stricter check below.
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'BAR'], { venueId: request.venueId })
  if (!await isDutyOrBarManager(resolved.account.id, request.night)) {
    throw createError({ statusCode: 403, statusMessage: 'A duty manager or bar manager decides a comp request' })
  }
  const account = resolved.account

  const refusal = await decideCompRequest(id, account.id, 'DECLINED', input.reason, expiryMinutes)
  if (refusal) throw compDecisionRefusalError(refusal)

  return { ok: true, request: await compRequestById(id, expiryMinutes) }
})
