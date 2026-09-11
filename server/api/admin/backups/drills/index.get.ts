import { eq, sql } from 'drizzle-orm'
import { backupDrillsList } from '#shared/utils/backup-drills-list'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { tableColumns, whereFrom } from '#server/utils/list-filters'
import type { Reference } from '#server/utils/list-filters'

const query = filterQuerySchema(backupDrillsList)

// `rowid` is insertion order and not a Drizzle column; `created_at` is second precision and ties.
// Qualified: the listing joins `users`, which has a `rowid` of its own.
function drillColumn(name: string): Reference | undefined {
  if (name === 'rowid') return sql`${schema.backupDrills}.rowid`
  return tableColumns(schema.backupDrills)(name)
}

// Every recorded drill, newest first (K-108 criterion 3, J-107 criterion 3, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'backups.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const { where, orderBy } = whereFrom(backupDrillsList, input, {
    column: drillColumn,
    search: [schema.users.name, schema.backupDrills.notes],
  })

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
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})
