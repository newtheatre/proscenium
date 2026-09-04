import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { londonDayOf } from '#shared/utils/ledger'
import { variantStatusForm } from '#shared/utils/bar'

// Retire a serving size, or put it back. Retiring takes it off the till and touches no historical
// line, no movement and no price row (F-112 criterion 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await variantById(id, londonDayOf(new Date()))
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such serving size' })

  const { status } = await readValidatedBodyOrThrow(event, variantStatusForm)
  if (status === held.status) {
    throw createError({
      statusCode: 409,
      statusMessage: status === 'RETIRED' ? `${held.label} is already retired` : `${held.label} is not retired`,
    })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.variant.status.changed',
    target: `bar-variant:${id}`,
    detail: changes({ status: [held.status, status] }),
  })

  // The audit insert reads `changes()`, this connection's own UPDATE row count, not the
  // resulting state: a losing request's UPDATE touches nothing, whatever the winner did (0003).
  await db.batch([
    db.run(sql`UPDATE product_variants SET status = ${status} WHERE id = ${id} AND status = ${held.status}`),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ])

  return { ok: true, status }
})
