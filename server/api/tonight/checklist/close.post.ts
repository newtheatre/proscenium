// Close the night. Blocked while any required item is unticked, naming what is missing rather
// than a bare refusal (criterion 4). A second close refuses with 409, matching the till's own.
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')

  const already = await closeFor(resolved.venueId, resolved.night)
  if (already) throw createError({ statusCode: 409, statusMessage: 'Tonight is already closed' })

  const items = await checklistFor(resolved.venueId, resolved.night)
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
    target: `venue:${resolved.venueId}`,
    detail: { night: resolved.night },
  })

  const closed = await auditedWrite(db.all<{ id: string }>(closeStatement(resolved.venueId, resolved.night, resolved.account.id, id)), entry)
  if (!closed) throw createError({ statusCode: 409, statusMessage: 'Tonight is already closed' })

  return { ok: true, closedAt: Math.floor(Date.now() / 1000) }
})
