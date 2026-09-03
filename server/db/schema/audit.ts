import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Append-only, enforced by triggers rather than by convention (0010). `detail` never carries
// personal free text, so erasure never has to reach into it (0011).
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  target: text('target'),
  detail: text('detail', { mode: 'json' }),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, table => [
  index('audit_log_actor').on(table.actorId),
  index('audit_log_action').on(table.action),
  index('audit_log_target').on(table.target),
  index('audit_log_created_at').on(table.createdAt),
  // One officer bypass per night, venue and role: the target carries that key, and the index is
  // what makes "once" the database's answer rather than a read before a write (0044, E-111).
  uniqueIndex('audit_log_officer_bypass_once').on(table.actorId, table.target)
    .where(sql`action = 'night.officer-bypass'`),
])
