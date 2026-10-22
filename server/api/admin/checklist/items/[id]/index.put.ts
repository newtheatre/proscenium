import { changes } from '#shared/utils/audit'
import { checklistItemForm } from '#shared/utils/checklist'

// Edit a checklist item. Affects only a night not yet stamped: tonight's own checklist, if
// already touched, keeps what it stamped (E-114 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'checklist.write')
  const input = await readValidatedBodyOrThrow(event, checklistItemForm)

  const before = (await itemsForVenue(input.venueId, true)).find(item => item.id === id)
  if (!before) throw noSuch('checklist item')

  await db.batch([
    db.run(updateItemStatement(id, input, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'checklist-item.updated',
      target: `checklist-item:${id}`,
      // Every field the statement writes, since phase and how it ticks change what the night does.
      detail: changes({
        phase: [before.phase, input.phase],
        label: [before.label, input.label],
        sort: [before.sort, input.sort],
        required: [before.required, input.required],
        systemCheck: [before.systemCheck, input.systemCheck],
      }),
    })),
  ])

  return { ok: true }
})
