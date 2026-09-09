import { presetForm } from '#shared/utils/backstage'

// Add a preset. A message snapshots the body at send time, so editing or retiring one later
// changes nothing already on the board (E-121 criterion 2).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'board.write')
  const { label, body, sort } = await readValidatedBodyOrThrow(event, presetForm)

  const id = newId()
  await db.batch([
    db.run(insertPresetStatement(label, body, sort, resolved.account.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'backstage-preset.created',
      target: `backstage-preset:${id}`,
      detail: { label },
    })),
  ])

  return { ok: true, id }
})
