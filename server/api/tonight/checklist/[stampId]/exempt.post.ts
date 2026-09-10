import { exemptForm } from '#shared/utils/checklist'

// The exception path: close over an incomplete item by recording a reason (criterion 5), for a
// night report and FOH digest that do not exist yet to read it (docs/known-issues.md).
export default defineEventHandler(async (event) => {
  const stampId = getRouterParam(event, 'stampId') ?? ''
  const { performanceId, reason } = await readValidatedBodyOrThrow(event, exemptForm)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', performanceId ? { performanceId } : {})

  const target = performanceId ?? resolved.performanceIds[0]
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight' })
  if (!performanceId && resolved.performanceIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one performance is running tonight: name the performance' })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'checklist.exempted',
    target: `checklist-stamp:${stampId}`,
  })

  const exempted = await auditedWrite(
    db.all<{ id: string }>(exemptStatement(stampId, target, reason, resolved.account.id)),
    entry,
  )
  if (!exempted) throw createError({ statusCode: 409, statusMessage: 'That item cannot be exempted: it may already be ticked, exempted, or system-verified' })

  return { ok: true }
})
