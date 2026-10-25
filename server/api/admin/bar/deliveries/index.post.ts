import { sql } from 'drizzle-orm'
import { deliveryCost, deliveryNoteForm } from '#shared/utils/bar'
import type { BatchItem } from 'drizzle-orm/batch'

// Record a delivery note: every line a DELIVERY movement of its own, written together or not at
// all. Each row is the record, as a single delivery's is, so nothing writes a second (0010, 0254).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const { lines } = await readValidatedBodyOrThrow(event, deliveryNoteForm)

  // The whole catalogue in one fixed statement, never an IN built from the note's own lines (0006).
  const items = new Map((await db.all<{ id: string, name: string, unit: 'ML' | 'ITEM', containerMl: number | null, status: string }>(sql`
    SELECT id, name, unit, container_ml AS containerMl, status FROM bar_items
  `)).map(item => [item.id, item]))

  const missing = lines.filter(line => !items.has(line.itemId))
  if (missing.length > 0) throw noSuch('stocked item')
  const retired = lines.map(line => items.get(line.itemId)!).filter(item => item.status === 'RETIRED')
  if (retired.length > 0) {
    throw createError({ statusCode: 409, statusMessage: `${retired.map(item => item.name).join(', ')} ${retired.length === 1 ? 'is' : 'are'} retired: put ${retired.length === 1 ? 'it' : 'them'} back before taking a delivery, or leave ${retired.length === 1 ? 'it' : 'them'} off the note` })
  }

  const statements: BatchItem<'sqlite'>[] = lines.map((line) => {
    const cost = deliveryCost(items.get(line.itemId)!, line.qty, line.costPence ?? null)
    return db.run(sql`
      INSERT INTO stock_movements (id, item_id, qty, kind, reason, unit_cost_pence, container_cost_pence, container_qty, reverses_id, actor_id)
      VALUES (${newId()}, ${line.itemId}, ${line.qty}, 'DELIVERY', NULL, ${cost.unitCostPence}, ${cost.containerCostPence}, ${cost.containerQty}, NULL, ${resolved.account.id})
    `)
  })
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  return { ok: true, recorded: lines.length }
})
