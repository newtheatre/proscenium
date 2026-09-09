import { closeFollowUpForm } from '#shared/utils/incident-safety'

// Close a follow-up with a resolution note. Append-only: the closure is a new entry, never an
// edit to the incident it closes (E-116 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'safety.write')
  const { resolutionNote } = await readValidatedBodyOrThrow(event, closeFollowUpForm)

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'incident-followup.closed',
    target: `incident:${id}`,
  })

  const closed = await auditedWrite(db.all<{ id: string }>(closeFollowUpStatement(id, resolutionNote, resolved.account.id, newId())), entry)
  if (!closed) throw createError({ statusCode: 409, statusMessage: 'That entry is already closed, or does not exist' })

  return { ok: true }
})
