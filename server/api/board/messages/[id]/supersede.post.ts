import { supersedeMessageForm } from '#shared/utils/backstage'

// A mistaken milestone is corrected by a new event, never edited (E-121 criterion 5). Refused
// against anything that is not an unsuperseded milestone: free text and presets are not corrected.
export default defineEventHandler(async (event) => {
  const entryId = getRouterParam(event, 'id') ?? ''
  const device = await requireDevice(event)
  const input = await readValidatedBodyOrThrow(event, supersedeMessageForm)

  const call = await resolveCall('BACKSTAGE', { milestoneTypeId: input.milestoneTypeId, presetId: null, body: null })
  if ('refusal' in call) throw createError({ statusCode: 400, statusMessage: call.refusal })

  const id = newId()
  const entry = auditEntry({
    actorId: null,
    action: 'board.message-superseded',
    target: `board-message:${entryId}`,
    detail: { night: device.night, milestoneTypeId: input.milestoneTypeId },
  })

  const applied = await auditedWrite(
    db.all<{ id: string }>(supersedeMessageStatement(device.nightId, entryId, device.deviceId, input.milestoneTypeId, call.body, input.composedAt, id)),
    entry,
  )
  if (!applied) throw createError({ statusCode: 409, statusMessage: 'That call cannot be changed: it may not be the wings\' milestone, or may already be changed' })

  return { id }
})
