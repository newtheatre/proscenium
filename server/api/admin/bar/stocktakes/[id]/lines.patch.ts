import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  lines: z.array(z.object({
    lineId: z.string().trim().min(1),
    /**
     * Whole containers, a part bottle as a decimal. Null clears the count, and
     * a blank box means exactly that: `Number('')` is 0, which writes stock off.
     */
    countedContainers: z.preprocess(
      value => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.coerce.number().min(0).max(100_000).nullable(),
    ),
    reason: z.string().trim().max(200).nullable().optional(),
  })).min(1).max(50),
})

/** PATCH /api/admin/bar/stocktakes/:id/lines: record counts as they happen. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)

  const stocktake = await db.select({ status: schema.stocktakes.status })
    .from(schema.stocktakes).where(eq(schema.stocktakes.id, id)).get()
  if (!stocktake) throw createError({ statusCode: 404, statusMessage: 'No such stocktake.' })
  if (stocktake.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'That stocktake is closed.' })
  }

  // The whole sheet in one statement: an id list per line is what ADR-0006 forbids.
  const sizes = await db.select({
    lineId: schema.stocktakeLines.id,
    containerMl: schema.barProducts.containerMl,
  })
    .from(schema.stocktakeLines)
    .innerJoin(schema.barProducts, eq(schema.barProducts.id, schema.stocktakeLines.productId))
    .where(eq(schema.stocktakeLines.stocktakeId, id))
  const containerMl = new Map(sizes.map(s => [s.lineId, s.containerMl]))

  // Scoped by stocktake as well as line, so a line id from another take is a no-op.
  const statements = input.lines.map(line => db.update(schema.stocktakeLines).set({
    countedQty: line.countedContainers == null
      ? null
      : containersToQty({ containerMl: containerMl.get(line.lineId) ?? null }, line.countedContainers),
    reason: line.reason ?? null,
  }).where(and(
    eq(schema.stocktakeLines.id, line.lineId),
    eq(schema.stocktakeLines.stocktakeId, id),
  )) as BatchItem<'sqlite'>)

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { updated: statements.length }
})
