import { postMessageForm } from '#shared/utils/backstage'

// A milestone, a preset, or free text, never a mix (E-121 criteria 1, 2). The wording is resolved
// here, never trusted from the caller, and a call of front of house's is refused (issue 1313).
export default defineEventHandler(async (event) => {
  const device = await requireDevice(event)
  const input = await readValidatedBodyOrThrow(event, postMessageForm)

  const resolved = await resolveCall('BACKSTAGE', input)
  if ('refusal' in resolved) throw createError({ statusCode: 400, statusMessage: resolved.refusal })

  const id = newId()
  const entry = auditEntry({
    actorId: null,
    action: 'board.message-posted',
    target: `venue:${device.venueId}`,
    detail: { night: device.night, milestoneTypeId: input.milestoneTypeId },
  })

  await auditedWrite(
    db.all<{ id: string }>(postMessageStatement(device.nightId, device.deviceId, input.milestoneTypeId, resolved.body, input.composedAt, id)),
    entry,
  )

  return { id }
})
