import { desc } from 'drizzle-orm'
import { isDrillOverdue } from '#shared/utils/backup'
import { londonDay } from '#shared/utils/membership'

// The operations dashboard's backup card: when the drill last passed, and whether it is overdue
// (K-108 criterion 4, J-107 criterion 4).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'backups.read')

  const [last] = await db.select({ ranAt: schema.backupDrills.ranAt, outcome: schema.backupDrills.outcome })
    .from(schema.backupDrills)
    .orderBy(desc(schema.backupDrills.ranAt), desc(schema.backupDrills.createdAt))
    .limit(1)

  const intervalDays = await configValue(event, 'BACKUP_DRILL_INTERVAL_DAYS')
  const lastPassedAt = last?.outcome === 'PASS' ? last.ranAt : null

  return {
    lastDrillAt: last?.ranAt ?? null,
    lastDrillOutcome: last?.outcome ?? null,
    intervalDays,
    overdue: isDrillOverdue(lastPassedAt, intervalDays, londonDay(new Date())),
  }
})
