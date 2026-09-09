import { postMessageForm } from '#shared/utils/backstage'

// A milestone, a preset, or free text, never a mix (E-121 criteria 1, 2). The wording is
// resolved here, never trusted from the caller, so a message reads the committee's current copy.
export default defineEventHandler(async (event) => {
  const device = await requireDevice(event)
  const input = await readValidatedBodyOrThrow(event, postMessageForm)

  const body = input.milestoneTypeId
    ? await milestoneLabel(input.milestoneTypeId)
    : input.presetId
      ? await presetBody(input.presetId)
      : input.body

  if (body === undefined || body === null) {
    throw createError({ statusCode: 400, statusMessage: 'That milestone or preset is not configured, or has been retired' })
  }

  const id = newId()
  const entry = auditEntry({
    actorId: null,
    action: 'board.message-posted',
    target: `venue:${device.venueId}`,
    detail: { night: device.night, milestoneTypeId: input.milestoneTypeId },
  })

  await auditedWrite(
    db.all<{ id: string }>(postMessageStatement(device.nightId, device.deviceId, input.milestoneTypeId, body, input.composedAt, id)),
    entry,
  )

  return { id }
})
