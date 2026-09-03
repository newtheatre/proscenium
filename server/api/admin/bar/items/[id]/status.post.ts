import { eq } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { stockItemStatusForm } from '#shared/utils/bar'

// Retire a stocked item, or put it back. Retiring takes it off the lists and leaves every
// movement it carries exactly where it is (F-114 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await itemById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })

  const { status } = await readValidatedBodyOrThrow(event, stockItemStatusForm)
  if (status === held.status) {
    throw createError({
      statusCode: 409,
      statusMessage: status === 'RETIRED' ? `${held.name} is already retired` : `${held.name} is not retired`,
    })
  }

  if (status === 'RETIRED' && held.onHand !== 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} still has stock on hand: write it off or count it out before retiring it`,
    })
  }

  await db.batch([
    db.update(schema.barItems).set({ status }).where(eq(schema.barItems.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar.item.status.changed',
      target: `bar-item:${id}`,
      detail: changes({ status: [held.status, status] }),
    })),
  ])

  return { ok: true, status }
})
