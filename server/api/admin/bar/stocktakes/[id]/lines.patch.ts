import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  lines: z.array(z.object({
    lineId: z.string().trim().min(1),
    /** Whole units. Null clears a count back to uncounted. */
    countedUnits: z.coerce.number().min(0).max(100_000).nullable(),
    reason: z.string().trim().max(200).nullable().optional(),
  })).min(1).max(50),
})

/** PATCH /api/admin/bar/stocktakes/:id/lines — record counts as they happen. */
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

  // Scoped by stocktake as well as line, so a line id from another take is a no-op.
  const statements = input.lines.map(line => db.update(schema.stocktakeLines).set({
    countedMilli: line.countedUnits == null ? null : Math.round(line.countedUnits * 1000),
    reason: line.reason ?? null,
  }).where(and(
    eq(schema.stocktakeLines.id, line.lineId),
    eq(schema.stocktakeLines.stocktakeId, id),
  )) as BatchItem<'sqlite'>)

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { updated: statements.length }
})
