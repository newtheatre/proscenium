import { fohMessageForm } from '#shared/utils/backstage'

// Front of house's own end of the board: a preset or free text, sent under shift authority
// rather than a join code (E-121 criterion 7). The wording is resolved here, never trusted.
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const input = await readValidatedBodyOrThrow(event, fohMessageForm)

  const night = await ensureNight(resolved.venueId, resolved.night)
  const body = input.presetId ? await presetBody(input.presetId) : input.body

  if (body === undefined || body === null) {
    throw createError({ statusCode: 400, statusMessage: 'That preset is not configured, or has been retired' })
  }

  const deviceId = await fohDevice(backstageBoardSecret(), night)
  const id = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'board.message-posted',
    target: `venue:${resolved.venueId}`,
    detail: { night: resolved.night, side: 'FOH' },
  })

  await auditedWrite(
    db.all<{ id: string }>(postMessageStatement(night.id, deviceId, null, body, input.composedAt, id)),
    entry,
  )

  return { id }
})
