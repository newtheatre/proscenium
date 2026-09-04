import { sql } from 'drizzle-orm'
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

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.item.status.changed',
    target: `bar-item:${id}`,
    detail: changes({ status: [held.status, status] }),
  })

  // The audit insert reads `changes()`, this connection's own UPDATE row count, not the
  // resulting state: a losing request's UPDATE touches nothing, whatever the winner did (0049).
  const [updated] = await db.batch([
    db.all<{ id: string }>(sql`
      UPDATE bar_items SET status = ${status} WHERE id = ${id} AND status = ${held.status} RETURNING id
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
    const now = await itemById(id)
    if (!now) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })
    throw createError({
      statusCode: 409,
      statusMessage: now.status === status
        ? (status === 'RETIRED' ? `${now.name} is already retired` : `${now.name} is not retired`)
        : `${now.name} changed while you were editing it`,
    })
  }

  return { ok: true, status }
})
