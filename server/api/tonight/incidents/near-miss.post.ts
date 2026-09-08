import { nearMissForm } from '#shared/utils/incidents'

// One tap to open, one to pick a category, one sentence: no severity triage and never blocks
// another flow (E-117 criteria 1, 2). Always now: a near miss is reported as it happens.
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'DOOR', 'BAR'])
  const input = await readValidatedBodyOrThrow(event, nearMissForm)

  const id = newId()
  const happenedAt = Math.floor(Date.now() / 1000)
  const write = recordIncidentStatement(resolved.account.id, input.performanceId, input.category, 'NEAR_MISS', input.body, happenedAt, id)
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'incident.logged',
    target: `incident:${id}`,
    detail: { category: input.category, severity: 'NEAR_MISS' },
  })

  const created = await withIncidentConstraints(() => auditedWrite(db.all<{ id: string }>(write.statement), entry))
  if (!created) throw createError({ statusCode: 500, statusMessage: 'Could not log that near miss' })

  return { ok: true, id: write.id }
})
