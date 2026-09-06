import { desc, eq, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { envelope, offsetFor, pageQuery } from '#shared/utils/pagination'
import type { SQL } from 'drizzle-orm'

const query = pageQuery.extend({
  search: z.string().trim().max(200).optional(),
})

// Every recorded drill, newest first (K-108 criterion 3, J-107 criterion 3).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'backups.read')
  const input = await getValidatedQueryOrThrow(event, query)

  let where: SQL | undefined
  if (input.search) {
    const wanted = `%${input.search.toLowerCase()}%`
    where = or(
      like(sql`lower(${schema.users.name})`, wanted),
      like(sql`lower(${schema.backupDrills.notes})`, wanted),
    )
  }

  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.backupDrills)
    .innerJoin(schema.users, eq(schema.users.id, schema.backupDrills.operatorId))
    .where(where)

  const items = await db.select({
    id: schema.backupDrills.id,
    ranAt: schema.backupDrills.ranAt,
    operatorId: schema.backupDrills.operatorId,
    operatorName: schema.users.name,
    outcome: schema.backupDrills.outcome,
    timeToRestoreMinutes: schema.backupDrills.timeToRestoreMinutes,
    rowCountsMatch: schema.backupDrills.rowCountsMatch,
    moneyTotalsMatch: schema.backupDrills.moneyTotalsMatch,
    notes: schema.backupDrills.notes,
    createdAt: schema.backupDrills.createdAt,
  })
    .from(schema.backupDrills)
    .innerJoin(schema.users, eq(schema.users.id, schema.backupDrills.operatorId))
    .where(where)
    .orderBy(desc(schema.backupDrills.ranAt), desc(schema.backupDrills.createdAt))
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})
