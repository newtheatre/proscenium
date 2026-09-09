import { changes } from '#shared/utils/audit'
import { presetForm } from '#shared/utils/backstage'

// Edit a preset's label, body or order.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'board.write')
  const { label, body, sort } = await readValidatedBodyOrThrow(event, presetForm)

  const before = (await presets(true)).find(preset => preset.id === id)
  if (!before) throw createError({ statusCode: 404, statusMessage: 'No such preset' })

  await db.batch([
    db.run(updatePresetStatement(id, label, body, sort, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'backstage-preset.updated',
      target: `backstage-preset:${id}`,
      detail: changes({ label: [before.label, label] }),
    })),
  ])

  return { ok: true }
})
