import { sql } from 'drizzle-orm'
import { stocktakeCountsForm } from '#shared/utils/stocktakes'
import type { BatchItem } from 'drizzle-orm/batch'

// Record counts against an open stocktake, one item at a time or several at once. Each write
// carries its own "still open" predicate, so a stocktake applied mid-submission takes none of it.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await stocktakeById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such stocktake' })

  const { counts } = await readValidatedBodyOrThrow(event, stocktakeCountsForm)

  // What the audit records is what could possibly match a line here, not what was merely sent:
  // a stale client resubmitting an item this stocktake never had should not read as having counted it.
  const existing = new Set((await stocktakeLines(id)).map(line => line.itemId))
  const matched = counts.filter(count => existing.has(count.itemId))

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.stocktake.counted',
    target: `bar-stocktake:${id}`,
    detail: { items: matched.length },
  })

  const statements: BatchItem<'sqlite'>[] = [
    ...counts.map(count => db.run(sql`
      UPDATE stocktake_lines SET counted_qty = ${count.counted}
      WHERE stocktake_id = ${id} AND item_id = ${count.itemId}
        AND EXISTS (SELECT 1 FROM stocktakes WHERE id = ${id} AND status = 'OPEN')
    `)),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE EXISTS (SELECT 1 FROM stocktakes WHERE id = ${id} AND status = 'OPEN')
    `),
  ]
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  // Whether ours landed reads off the stocktake's own state, not a flag any one statement set:
  // status can only move OPEN to APPLIED, never back, so this is accurate whichever way it raced.
  const after = await stocktakeById(id)
  if (after?.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'This stocktake is no longer open, so nothing here was recorded' })
  }

  return { ok: true, lines: await stocktakeLines(id) }
})
