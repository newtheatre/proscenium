import { supersedeMessageForm } from '#shared/utils/backstage'

// Front of house changes its own mis-tapped milestone into another of its own, never the wings'
// (E-121 criterion 5, issue 1313); the statement's predicate is what refuses anything else.
export default defineEventHandler(async (event) => {
  const entryId = getRouterParam(event, 'id') ?? ''
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const input = await readValidatedBodyOrThrow(event, supersedeMessageForm)

  const call = await resolveCall('FOH', { milestoneTypeId: input.milestoneTypeId, presetId: null, body: null })
  if ('refusal' in call) throw createError({ statusCode: 400, statusMessage: call.refusal })

  const night = await ensureNight(resolved.venueId, resolved.night)
  const deviceId = await fohDevice(backstageBoardSecret(), night)
  const id = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'board.message-superseded',
    target: `board-message:${entryId}`,
    detail: { night: resolved.night, side: 'FOH', milestoneTypeId: input.milestoneTypeId },
  })

  const applied = await auditedWrite(
    db.all<{ id: string }>(supersedeMessageStatement(night.id, entryId, deviceId, input.milestoneTypeId, call.body, input.composedAt, id)),
    entry,
  )
  if (!applied) throw createError({ statusCode: 409, statusMessage: 'That call cannot be changed: it may not be front of house\'s milestone, or may already be changed' })

  return { id }
})
