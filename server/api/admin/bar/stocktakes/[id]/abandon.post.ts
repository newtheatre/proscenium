import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import { manageBar } from '~~/shared/utils/abilities'

/** POST /api/admin/bar/stocktakes/:id/abandon: walk away, writing nothing. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)
  const id = getRouterParam(event, 'id')!
  const { user } = await requireUserSession(event)

  const stocktake = await db.select({ status: schema.stocktakes.status })
    .from(schema.stocktakes).where(eq(schema.stocktakes.id, id)).get()
  if (!stocktake) throw createError({ statusCode: 404, statusMessage: 'No such stocktake.' })
  if (stocktake.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'That stocktake is already closed.' })
  }

  await db.update(schema.stocktakes).set({
    status: 'ABANDONED',
    finishedByUserId: user.id,
    finishedAt: sql`(current_timestamp)`,
  }).where(eq(schema.stocktakes.id, id))

  return { ok: true }
})
