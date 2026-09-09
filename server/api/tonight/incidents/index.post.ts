import { incidentForm } from '#shared/utils/incidents'
import { showNightBounds } from '#shared/utils/show-night'

// Log an incident, at most two navigations from the tonight screen (E-115 criteria 1, 6).
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'DOOR', 'BAR'])
  const input = await readValidatedBodyOrThrow(event, incidentForm)

  // Defaults to now; backdatable within tonight only (criterion 1). The boundary is a moving
  // target against the wall clock, so it is checked here rather than as a static CHECK.
  const { from, to } = showNightBounds(resolved.night)
  const happenedAt = input.happenedAt ?? Math.floor(Date.now() / 1000)
  const bounds = { from: Math.floor(from.getTime() / 1000), to: Math.floor(to.getTime() / 1000) }
  if (happenedAt < bounds.from || happenedAt >= bounds.to) {
    throw createError({ statusCode: 400, statusMessage: 'That time is outside tonight' })
  }

  const id = newId()
  const write = recordIncidentStatement(resolved.account.id, input.performanceId, input.category, input.severity, input.body, happenedAt, id)
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'incident.logged',
    target: `incident:${id}`,
    detail: { category: input.category, severity: input.severity },
  })

  const created = await withIncidentConstraints(() => auditedWrite(db.all<{ id: string }>(write.statement), entry))
  if (!created) throw createError({ statusCode: 500, statusMessage: 'Could not log that incident' })

  await notifySafetyOfficersIfNeeded(event, write.id, input.category, input.severity)

  return { ok: true, id: write.id }
})
