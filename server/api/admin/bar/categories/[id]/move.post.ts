import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { categoryMoveForm } from '#shared/utils/bar'

// Drag to order (0143): one category to a place in the till's order, every other renumbered
// around it in the same statement, so the order stays 0..n-1 and binds a fixed four parameters.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await categoryById(id)
  if (!held) throw noSuch('category')

  const { position } = await readValidatedBodyOrThrow(event, categoryMoveForm)

  const applied = await auditedWrite(
    db.all<{ id: string }>(sql`
      UPDATE bar_categories SET sort = placed.position
      FROM (
        SELECT id, CASE WHEN rank < ${position} THEN rank ELSE rank + 1 END AS position
        FROM (SELECT id, row_number() OVER (ORDER BY sort, name COLLATE NOCASE) - 1 AS rank FROM bar_categories WHERE id <> ${id})
        UNION ALL
        SELECT id, min(${position}, (SELECT count(*) - 1 FROM bar_categories)) FROM bar_categories WHERE id = ${id}
      ) AS placed
      WHERE placed.id = bar_categories.id
      RETURNING bar_categories.id
    `),
    auditEntry({
      actorId: resolved.account.id,
      action: 'bar.category.moved',
      target: `bar-category:${id}`,
      detail: changes({ sort: [held.sort, position] }),
    }),
  )
  if (!applied) throw noSuch('category')

  return { ok: true }
})
