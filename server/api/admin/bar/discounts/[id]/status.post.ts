import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { discountStatusForm } from '#shared/utils/discounts'

// Retire a discount, or bring one back. Retiring only stops new sales applying it: every line it
// already discounted keeps its own snapshot regardless (F-117 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await discountById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such discount' })

  const { status } = await readValidatedBodyOrThrow(event, discountStatusForm)
  if (status === held.status) {
    throw createError({ statusCode: 409, statusMessage: `${held.name} is already ${status === 'ACTIVE' ? 'active' : 'retired'}` })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.discount.status.changed',
    target: `bar-discount:${id}`,
    detail: changes({ status: [held.status, status] }),
  })

  const applied = await auditedWrite(
    db.all<{ id: string }>(sql`UPDATE discounts SET status = ${status} WHERE id = ${id} AND status = ${held.status} RETURNING id`),
    entry,
  )

  if (!applied) {
    const now = await discountById(id)
    if (!now) throw createError({ statusCode: 404, statusMessage: 'No such discount' })
    throw createError({
      statusCode: 409,
      statusMessage: now.status === status
        ? `${now.name} is already ${status === 'ACTIVE' ? 'active' : 'retired'}`
        : `${now.name} changed while you were editing it`,
    })
  }

  return { ok: true, status }
})
