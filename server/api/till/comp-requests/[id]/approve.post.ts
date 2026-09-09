// Approve a comp request: tonight's duty manager or the bar manager, never the requester
// (F-110 criterion 1), claimed atomically so a race between two approvers settles to one.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which request' })

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

  const refusal = await decideCompRequest(id, account.id, 'APPROVED', null, expiryMinutes)
  if (refusal) throw compDecisionRefusalError(refusal)

  return { ok: true, request: await compRequestById(id, expiryMinutes) }
})
