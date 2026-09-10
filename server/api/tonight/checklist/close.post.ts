import { checklistScopeForm } from '#shared/utils/checklist'

// Close this performance. Blocked while any required item is unticked, naming what is missing
// rather than a bare refusal (criterion 4). A second close refuses with 409, matching the till's.
export default defineEventHandler(async (event) => {
  const { performanceId } = await readValidatedBodyOrThrow(event, checklistScopeForm)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', performanceId ? { performanceId } : {})

  const target = performanceId ?? resolved.performanceIds[0]
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight, so there is nothing to close' })
  if (!performanceId && resolved.performanceIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one performance is running tonight: name the performance' })
  }

  const already = await closeFor(target)
  if (already) throw createError({ statusCode: 409, statusMessage: 'This performance is already closed' })

  const items = await checklistFor(target)
  const missing = items.filter(item => item.required && !item.done)
  if (missing.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot close: ${missing.map(item => item.label).join(', ')} still needs completing or an exception recorded`,
    })
  }

  const id = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'checklist.closed',
    target: `performance:${target}`,
    detail: { night: resolved.night },
  })

  const closed = await auditedWrite(db.all<{ id: string }>(closeStatement(target, resolved.account.id, id)), entry)
  if (!closed) throw createError({ statusCode: 409, statusMessage: 'This performance is already closed' })

  return { ok: true, closedAt: Math.floor(Date.now() / 1000) }
})
