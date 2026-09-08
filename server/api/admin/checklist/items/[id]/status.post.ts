import { z } from 'zod'

const body = z.object({ venueId: z.string().min(1), active: z.boolean() })

// Retire or reinstate an item. Never deleted: a stamp already made keeps referencing it, so the
// history of a night already checked off never loses what it was checking (E-114 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'checklist.write')
  const { venueId, active } = await readValidatedBodyOrThrow(event, body)

  const before = (await itemsForVenue(venueId, true)).find(item => item.id === id)
  if (!before) throw createError({ statusCode: 404, statusMessage: 'No such checklist item' })

  await db.batch([
    db.run(retireItemStatement(id, active, resolved.account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: active ? 'checklist-item.reinstated' : 'checklist-item.retired',
      target: `checklist-item:${id}`,
    })),
  ])

  return { ok: true }
})
