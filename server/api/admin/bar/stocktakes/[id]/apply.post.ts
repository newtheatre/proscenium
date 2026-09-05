import { sql } from 'drizzle-orm'

// Post one adjustment movement per counted item whose count differs from what was expected, all
// in one transaction, and freeze the stocktake. A blank line writes nothing (F-115 criteria 4, 6).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await stocktakeById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such stocktake' })
  if (held.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'This stocktake has already been applied' })
  }

  // No count goes in the audit detail: a concurrent count submission before the batch runs would
  // make one wrong, and audit_log cannot be corrected afterwards (0010).
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.stocktake.applied',
    target: `bar-stocktake:${id}`,
    detail: {},
  })

  // The UPDATE returns its own row as proof of winning (0003): two calls from the same account
  // race exactly as two different accounts would, so nothing here compares actor ids (0001).
  const [won, , posted] = await db.batch([
    db.all<{ id: string }>(sql`
      UPDATE stocktakes SET status = 'APPLIED', applied_by = ${resolved.account.id}, applied_at = unixepoch()
      WHERE id = ${id} AND status = 'OPEN'
      RETURNING id
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
    // RETURNING rather than a bare INSERT: the response's own adjustment count comes from what
    // this statement actually did, never the pre-batch read above, which a race can make stale.
    db.all<{ id: string }>(sql`
      INSERT INTO stock_movements (id, item_id, qty, kind, ref_table, ref_id, actor_id)
      SELECT lower(hex(randomblob(16))), l.item_id, l.counted_qty - l.expected_qty, 'STOCKTAKE', 'stocktake_lines', l.id, ${resolved.account.id}
      FROM stocktake_lines l
      WHERE l.stocktake_id = ${id} AND l.counted_qty IS NOT NULL AND l.counted_qty <> l.expected_qty AND changes() = 1
      RETURNING id
    `),
  ])

  if (won.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'This stocktake has already been applied' })
  }

  return { ok: true, stocktake: await stocktakeById(id), adjustments: posted.length }
})
