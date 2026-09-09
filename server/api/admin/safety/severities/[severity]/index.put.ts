import { SEVERITIES } from '#shared/utils/incidents'
import { severityConfigForm } from '#shared/utils/incident-safety'

// Flip whether one severity routes to the safety officer. Every severity is seeded by
// migration, so this is always an UPDATE, never a create (criterion 1).
export default defineEventHandler(async (event) => {
  const severity = getRouterParam(event, 'severity') ?? ''
  const resolved = await requirePermission(event, 'safety.write')
  const { requiresFollowUp } = await readValidatedBodyOrThrow(event, severityConfigForm)

  if (!(SEVERITIES as readonly string[]).includes(severity)) {
    throw createError({ statusCode: 404, statusMessage: 'No such severity' })
  }

  await db.batch([
    db.run(setSeverityConfigStatement(severity, requiresFollowUp, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'incident-severity.routing-changed',
      target: `severity:${severity}`,
      detail: { requiresFollowUp },
    })),
  ])

  return { ok: true }
})
