import { exemptForm } from '#shared/utils/checklist'

// The exception path: close over an incomplete item by recording a reason (criterion 5), for a
// night report and FOH digest that do not exist yet to read it (docs/known-issues.md).
export default defineEventHandler(async (event) => {
  const stampId = getRouterParam(event, 'stampId') ?? ''
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const { reason } = await readValidatedBodyOrThrow(event, exemptForm)

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'checklist.exempted',
    target: `checklist-stamp:${stampId}`,
  })

  const exempted = await auditedWrite(
    db.all<{ id: string }>(exemptStatement(stampId, resolved.venueId, resolved.night, reason, resolved.account.id)),
    entry,
  )
  if (!exempted) throw createError({ statusCode: 409, statusMessage: 'That item cannot be exempted: it may already be ticked, exempted, or system-verified' })

  return { ok: true }
})
