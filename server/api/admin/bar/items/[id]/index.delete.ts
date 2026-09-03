import { eq } from 'drizzle-orm'

// Delete a stocked item nothing has ever moved. One that has can only be retired, because on-hand
// is the sum of its movements and they are append-only (F-114 criteria 1 and 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await itemById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })

  if (held.hasMovements) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has stock movements, so it can only be retired: every movement still has to resolve`,
    })
  }

  await db.batch([
    db.delete(schema.barItems).where(eq(schema.barItems.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar.item.deleted',
      target: `bar-item:${id}`,
      detail: { name: held.name, unit: held.unit },
    })),
  ])

  return { ok: true }
})
