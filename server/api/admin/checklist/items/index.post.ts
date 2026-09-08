import { checklistItemForm } from '#shared/utils/checklist'

// Add a checklist item to a venue. Changes here apply from the next show night: nothing already
// stamped moves, the same pattern E-101's shift templates set (E-114 criterion 1).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'checklist.write')
  const input = await readValidatedBodyOrThrow(event, checklistItemForm)

  const id = newId()
  await db.batch([
    db.run(insertItemStatement(input, resolved.account.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'checklist-item.created',
      target: `venue:${input.venueId}`,
      detail: { phase: input.phase, label: input.label },
    })),
  ])

  return { ok: true, id }
})
