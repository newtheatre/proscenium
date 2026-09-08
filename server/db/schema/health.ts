import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// At most one open incident estate-wide, stocktakes' singleton shape (F-115, J-106 criterion 5).
// Whether the IT Manager was told is `notification_log`'s own claim keyed on this id, not a column here (0048).
export const healthIncidents = sqliteTable('health_incidents', {
  id: id(),
  status: text('status').notNull().default('OPEN'),
  openedAt: integer('opened_at').notNull().default(now),
  closedAt: integer('closed_at'),
}, table => [
  uniqueIndex('health_incidents_one_open').on(table.status).where(sql`status = 'OPEN'`),
  check('health_incidents_status_values', sql`${table.status} IN ('OPEN', 'CLOSED')`),
  check('health_incidents_close_is_whole', sql`(${table.status} = 'OPEN') = (${table.closedAt} IS NULL)`),
])
