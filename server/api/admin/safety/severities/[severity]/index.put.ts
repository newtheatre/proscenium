import { SEVERITIES } from '#shared/utils/incidents'
import { severityConfigForm } from '#shared/utils/incident-safety'

// Flip whether one severity routes to the Theatre Manager. Every severity is seeded by
// migration, so this is always an UPDATE, never a create (criterion 1).
export default defineEventHandler(async (event) => {
  const severity = getRouterParam(event, 'severity') ?? ''
  const resolved = await requirePermission(event, 'safety.write')
  const { requiresFollowUp: routes } = await readValidatedBodyOrThrow(event, severityConfigForm)

  if (!(SEVERITIES as readonly string[]).includes(severity)) {
    throw noSuch('severity')
  }

  // Only a switch from off pulls anything in: a severity already routing has its list already.
  const switchingOn = routes && !(await requiresFollowUp(severity))
  const [{ waiting = 0 } = {}] = switchingOn
    ? await db.all<{ waiting: number }>(waitingAtSeverityQuery(severity))
    : []

  await db.batch([
    db.run(setSeverityConfigStatement(severity, routes, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'incident-severity.routing-changed',
      target: `severity:${severity}`,
      detail: { requiresFollowUp: routes },
    })),
  ])

  return { ok: true, waiting }
})
