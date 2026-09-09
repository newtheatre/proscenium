import { z } from 'zod'

const body = z.object({ active: z.boolean() })

// Retire or reinstate a preset. Never deleted: a message already posted keeps its own
// snapshotted body regardless (E-121 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'board.write')
  const { active } = await readValidatedBodyOrThrow(event, body)

  const before = (await presets(true)).find(preset => preset.id === id)
  if (!before) throw createError({ statusCode: 404, statusMessage: 'No such preset' })

  await db.batch([
    db.run(retirePresetStatement(id, active, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: active ? 'backstage-preset.reinstated' : 'backstage-preset.retired',
      target: `backstage-preset:${id}`,
    })),
  ])

  return { ok: true }
})
