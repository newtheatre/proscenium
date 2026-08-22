import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { eq, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  notes: z.string().trim().max(500).nullable().optional(),
}).optional().default({})

/** POST /api/admin/bar/stocktakes/:id/finish — apply the count as movements. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  const stocktake = await db.select({ status: schema.stocktakes.status })
    .from(schema.stocktakes).where(eq(schema.stocktakes.id, id)).get()
  if (!stocktake) throw createError({ statusCode: 404, statusMessage: 'No such stocktake.' })
  if (stocktake.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'That stocktake is already closed.' })
  }

  const counted = await db.select({
    id: schema.stocktakeLines.id,
    productId: schema.stocktakeLines.productId,
    expectedMilli: schema.stocktakeLines.expectedMilli,
    countedMilli: schema.stocktakeLines.countedMilli,
    reason: schema.stocktakeLines.reason,
  }).from(schema.stocktakeLines)
    .where(sql`${schema.stocktakeLines.stocktakeId} = ${id} and ${isNotNull(schema.stocktakeLines.countedMilli)}`)

  if (!counted.length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing was counted. Abandon it instead.' })
  }

  /**
   * Variance is against on-hand *now*, not the snapshot: a sale during the
   * count is real, and correcting to the snapshot would erase it.
   */
  const onHand = await onHandByProduct()

  // Opening stock, not variance: nothing was expected and nothing is on hand.
  // Judged per counted line, so an unrelated product's history cannot mask it.
  const opening = counted.every(line => line.expectedMilli === 0 && (onHand.get(line.productId) ?? 0) === 0)

  const movements = counted
    .map(line => ({
      productId: line.productId,
      qtyMilli: line.countedMilli! - (onHand.get(line.productId) ?? 0),
      kind: 'STOCKTAKE' as const,
      refTable: 'stocktake_lines',
      refId: line.id,
      reason: line.reason ?? (opening ? 'Opening stock' : null),
      createdByUserId: user.id,
    }))
    .filter(m => m.qtyMilli !== 0)

  await db.batch([
    db.update(schema.stocktakes).set({
      status: 'APPLIED',
      finishedByUserId: user.id,
      finishedAt: sql`(current_timestamp)`,
      notes: input.notes ?? null,
    }).where(eq(schema.stocktakes.id, id)),
    ...movementStatements(movements),
  ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return { applied: movements.length, counted: counted.length, opening }
})
