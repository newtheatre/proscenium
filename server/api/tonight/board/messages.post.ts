import { fohMessageForm } from '#shared/utils/backstage'

// Front of house's own end of the board: its own milestones, presets or free text, sent under
// shift authority rather than a join code (E-121 criterion 7, issue 1313). Wording resolved here.
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const input = await readValidatedBodyOrThrow(event, fohMessageForm)

  const call = await resolveCall('FOH', input)
  if ('refusal' in call) throw createError({ statusCode: 400, statusMessage: call.refusal })

  const night = await ensureNight(resolved.venueId, resolved.night)
  const deviceId = await fohDevice(backstageBoardSecret(), night)
  const id = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'board.message-posted',
    target: `venue:${resolved.venueId}`,
    detail: { night: resolved.night, side: 'FOH', milestoneTypeId: input.milestoneTypeId },
  })

  await auditedWrite(
    db.all<{ id: string }>(postMessageStatement(night.id, deviceId, input.milestoneTypeId, call.body, input.composedAt, id)),
    entry,
  )

  return { id }
})
