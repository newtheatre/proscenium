import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { manageBar } from '~~/shared/utils/abilities'

/** POST /api/admin/bar/stocktakes: start a count, snapshotting expected. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  const { user } = await requireUserSession(event)

  const open = await db.select({ id: schema.stocktakes.id }).from(schema.stocktakes)
    .where(eq(schema.stocktakes.status, 'OPEN')).get()
  if (open) {
    throw createError({ statusCode: 409, statusMessage: 'A stocktake is already open. Finish or abandon it first.' })
  }

  const products = await stockProducts()
  const active = products.filter(p => p.status === 'ACTIVE')
  if (!active.length) {
    throw createError({ statusCode: 400, statusMessage: 'Add a product to the catalogue first, then count what you have.' })
  }

  const onHand = await onHandByProduct()
  const stocktakeId = nanoid()

  // Expected is snapshotted now, so trading during the count shows as variance.
  const statements: BatchItem<'sqlite'>[] = [
    db.insert(schema.stocktakes).values({ id: stocktakeId, startedByUserId: user.id }),
    ...active.map(p => db.insert(schema.stocktakeLines).values({
      stocktakeId,
      productId: p.id,
      expectedMilli: onHand.get(p.id) ?? 0,
    }) as BatchItem<'sqlite'>),
  ]

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { id: stocktakeId, lines: active.length }
})
