import { changes } from '#shared/utils/audit'
import { checklistItemForm } from '#shared/utils/checklist'

// Edit a checklist item. Affects only a night not yet stamped: tonight's own checklist, if
// already touched, keeps what it stamped (E-114 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'checklist.write')
  const input = await readValidatedBodyOrThrow(event, checklistItemForm)

  const before = (await itemsForVenue(input.venueId, true)).find(item => item.id === id)
  if (!before) throw createError({ statusCode: 404, statusMessage: 'No such checklist item' })

  await db.batch([
    db.run(updateItemStatement(id, input, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'checklist-item.updated',
      target: `checklist-item:${id}`,
      detail: changes({ label: [before.label, input.label], required: [before.required, input.required] }),
    })),
  ])

  return { ok: true }
})
