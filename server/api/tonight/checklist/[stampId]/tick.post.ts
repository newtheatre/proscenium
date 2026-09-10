import { checklistScopeForm } from '#shared/utils/checklist'

// Tick a hand-ticked item. A system-verified item refuses here at the write's own predicate,
// since `system_check IS NULL` is part of it (E-114 criterion 3).
export default defineEventHandler(async (event) => {
  const stampId = getRouterParam(event, 'stampId') ?? ''
  const { performanceId } = await readValidatedBodyOrThrow(event, checklistScopeForm)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', performanceId ? { performanceId } : {})

  const target = performanceId ?? resolved.performanceIds[0]
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight' })
  if (!performanceId && resolved.performanceIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one performance is running tonight: name the performance' })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'checklist.ticked',
    target: `checklist-stamp:${stampId}`,
  })

  const ticked = await auditedWrite(db.all<{ id: string }>(tickStatement(stampId, target, resolved.account.id)), entry)
  if (!ticked) throw createError({ statusCode: 409, statusMessage: 'That item cannot be ticked: it may already be ticked, exempted, or system-verified' })

  return { ok: true }
})
