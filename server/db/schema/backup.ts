import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// A restore drill's outcome, append-only (K-108, J-107, 0010): a correction is a further row,
// never an edit to one already recorded.
export const backupDrills = sqliteTable('backup_drills', {
  id: id(),
  ranAt: text('ran_on').notNull(),
  operatorId: text('operator_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  outcome: text('outcome').notNull(),
  timeToRestoreMinutes: integer('time_to_restore_minutes').notNull(),
  rowCountsMatch: integer('row_counts_match', { mode: 'boolean' }).notNull(),
  moneyTotalsMatch: integer('money_totals_match', { mode: 'boolean' }).notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('backup_drills_ran_on').on(table.ranAt),
  check('backup_drills_outcome_values', sql`${table.outcome} IN ('PASS', 'FAIL')`),
  check('backup_drills_time_positive', sql`${table.timeToRestoreMinutes} > 0`),
])
