import { supersedeIncidentForm } from '#shared/utils/incidents'
import { showNightBounds } from '#shared/utils/show-night'

// A correction, never an edit: the entry it corrects stays visible, marked superseded by the
// chain (E-115 criterion 3). Predicated on the write, decided from its own RETURNING (0049).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'DOOR', 'BAR'])
  const input = await readValidatedBodyOrThrow(event, supersedeIncidentForm)

  const original = await incidentById(id)
  if (!original) throw createError({ statusCode: 404, statusMessage: 'No such entry' })

  const { from, to } = showNightBounds(resolved.night)
  const happenedAt = input.happenedAt ?? original.happenedAt
  const bounds = { from: Math.floor(from.getTime() / 1000), to: Math.floor(to.getTime() / 1000) }
  if (happenedAt < bounds.from || happenedAt >= bounds.to) {
    throw createError({ statusCode: 400, statusMessage: 'That time is outside tonight' })
  }

  const correctionId = newId()
  const write = supersedeIncidentStatement(
    resolved.account.id, id, original.performanceId, input.category, input.severity, input.body, happenedAt, correctionId,
  )
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'incident.superseded',
    target: `incident:${id}`,
    detail: { correctionId },
  })

  const corrected = await withIncidentConstraints(() => auditedWrite(db.all<{ id: string }>(write.statement), entry))
  if (!corrected) {
    throw createError({ statusCode: 409, statusMessage: 'That entry has already been corrected: correct the correction instead' })
  }

  // A correction can move severity into follow-up territory (or out of it): only the new
  // entry's own severity is ever checked, matching how the log already reads it (E-116).
  await notifySafetyOfficersIfNeeded(event, write.id, input.category, input.severity)

  return { ok: true, id: write.id }
})
