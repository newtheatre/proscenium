import { sql } from 'drizzle-orm'
import { onHandColumn } from '#server/utils/bar'

// One attempt: create the stocktake if the slot is free, or say which one is already open. Lines
// are captured now, one per active stocked item, so a sale after this cannot muddy the comparison.
async function attempt(id: string, actorId: string): Promise<boolean> {
  const entry = auditEntry({
    actorId,
    action: 'bar.stocktake.opened',
    target: `bar-stocktake:${id}`,
    detail: {},
  })

  // The INSERT returns its own row as proof of winning (0003): a losing racer's INSERT changes
  // nothing, so the lines and the audit row, both guarded on this id existing, write nothing (0001).
  const [won] = await db.batch([
    db.all<{ id: string }>(sql`
      INSERT INTO stocktakes (id, status, opened_by)
      VALUES (${id}, 'OPEN', ${actorId})
      ON CONFLICT (status) WHERE status = 'OPEN' DO NOTHING
      RETURNING id
    `),
    db.run(sql`
      INSERT INTO stocktake_lines (id, stocktake_id, item_id, expected_qty, counted_qty)
      SELECT lower(hex(randomblob(16))), ${id}, i.id, ${onHandColumn('i')}, NULL
      FROM bar_items i
      WHERE i.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM stocktakes WHERE id = ${id})
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE EXISTS (SELECT 1 FROM stocktakes WHERE id = ${id})
    `),
  ])
  return won.length > 0
}

export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')

  // A losing attempt reads the stocktake that beat it; if that one is applied first, the read
  // finds nothing and the slot is free, so retrying rather than refusing is the honest answer.
  for (let round = 0; round < 3; round++) {
    const id = newId()
    const won = await attempt(id, resolved.account.id)
    const held = won ? await stocktakeById(id) : await openStocktake()
    if (held) return { ok: true, opened: won, stocktake: held, lines: await stocktakeLines(held.id) }
  }

  throw createError({ statusCode: 500, statusMessage: 'The stocktake did not open' })
})
