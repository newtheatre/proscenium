// Mark an incident reviewed: acknowledgement for the close-night checklist, never a resolution
// of a follow-up, which is E-116's own workflow (E-114 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')

  const found = await incidentById(id)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'No such entry' })

  // Idempotent by intent, not by constraint: the checklist only asks whether a review exists,
  // never how many, so a second review costs a harmless extra row rather than a conflict.
  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'incident.reviewed',
    target: `incident:${id}`,
  }))

  return { ok: true }
})
