import { changes } from '#shared/utils/audit'
import { presetForm } from '#shared/utils/backstage'

// Edit a preset's label, body, order or end (issue 1313).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'board.write')
  const { label, body, sort, side } = await readValidatedBodyOrThrow(event, presetForm)

  const before = (await presets(true)).find(preset => preset.id === id)
  if (!before) throw noSuch('preset')

  await db.batch([
    db.run(updatePresetStatement(id, label, body, sort, resolved.account.id, side)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'backstage-preset.updated',
      target: `backstage-preset:${id}`,
      detail: changes({ label: [before.label, label], side: [before.side, side] }),
    })),
  ])

  return { ok: true }
})
