import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { productStatusForm, says } from '#shared/utils/bar'

// Put a product on the till, hide it, or retire it. Retirement is one way, because a retired
// product is still what every historical line was sold as (F-111 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await productById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such product' })

  const { status } = await readValidatedBodyOrThrow(event, productStatusForm)
  if (status === held.status) {
    throw createError({ statusCode: 409, statusMessage: `${held.name} is already ${says(status).toLowerCase()}` })
  }

  if (held.status === 'RETIRED' && held.everSold) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} has been sold, so it stays retired: add a new product rather than reviving this one`,
    })
  }

  if (status === 'ACTIVE') {
    const missing = await missingBeforeActive(id)
    if (missing.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `${held.name} cannot go on the till until it has ${missing.join(' and ')}`,
      })
    }
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.product.status.changed',
    target: `bar-product:${id}`,
    detail: changes({ status: [held.status, status] }),
  })

  // The audit insert reads `changes()`, this connection's own UPDATE row count, not the
  // resulting state: a losing request's UPDATE touches nothing, whatever the winner did (0049).
  const [updated] = await db.batch([
    db.all<{ id: string }>(sql`
      UPDATE bar_products SET status = ${status} WHERE id = ${id} AND status = ${held.status} RETURNING id
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ])

  // A losing racer is refused, not told it succeeded: the audit stayed silent, so the caller
  // must too (0049).
  if (updated.length === 0) {
    const now = await productById(id)
    if (!now) throw createError({ statusCode: 404, statusMessage: 'No such product' })
    throw createError({
      statusCode: 409,
      statusMessage: now.status === status
        ? `${now.name} is already ${says(status).toLowerCase()}`
        : `${now.name} changed while you were editing it`,
    })
  }

  return { ok: true, status }
})
