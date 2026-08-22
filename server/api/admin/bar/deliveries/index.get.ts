import { db, schema } from '@nuxthub/db'
import { count, desc, eq } from 'drizzle-orm'
import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/deliveries: what came in, most recent first. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const query = await getValidatedQuery(event, paginationSchema.parse)
  const where = query.q ? likeInsensitive(schema.stockDeliveries.supplier, query.q) : undefined

  const [rows, [total]] = await Promise.all([
    db.select({
      id: schema.stockDeliveries.id,
      supplier: schema.stockDeliveries.supplier,
      deliveredOn: schema.stockDeliveries.deliveredOn,
      invoiceRef: schema.stockDeliveries.invoiceRef,
      totalPence: schema.stockDeliveries.totalPence,
      receivedBy: schema.users.name,
      lineCount: count(schema.stockDeliveryLines.id),
    })
      .from(schema.stockDeliveries)
      .leftJoin(schema.users, eq(schema.users.id, schema.stockDeliveries.receivedByUserId))
      .leftJoin(schema.stockDeliveryLines, eq(schema.stockDeliveryLines.deliveryId, schema.stockDeliveries.id))
      .where(where)
      .groupBy(schema.stockDeliveries.id)
      .orderBy(desc(schema.stockDeliveries.deliveredOn), desc(schema.stockDeliveries.createdAt))
      .limit(query.limit).offset(offsetFor(query)),
    db.select({ value: count() }).from(schema.stockDeliveries).where(where),
  ])

  return paginated(rows, total?.value ?? 0, query)
})
