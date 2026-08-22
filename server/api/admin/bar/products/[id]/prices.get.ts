import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/products/:id/prices — the history, newest first. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const productId = getRouterParam(event, 'id')!
  const today = londonDate()

  const rows = await db.select({
    id: schema.barPrices.id,
    pricePence: schema.barPrices.pricePence,
    effectiveFrom: schema.barPrices.effectiveFrom,
    setBy: schema.users.name,
  })
    .from(schema.barPrices)
    .leftJoin(schema.users, eq(schema.users.id, schema.barPrices.createdByUserId))
    .where(eq(schema.barPrices.productId, productId))
    .orderBy(desc(schema.barPrices.effectiveFrom))
    .limit(50)

  return {
    rows: rows.map(row => ({
      ...row,
      // A row dated ahead of today is scheduled, not in force.
      pending: row.effectiveFrom > today,
    })),
  }
})
