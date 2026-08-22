/**
 * Opening and closing the bar for a night, and the day's reconciliation.
 * A session is per NIGHT, the Z-total is per DAY (docs/13 §3, §4.5).
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { performances } from './show'
import { users } from './user'

export const barSessions = sqliteTable('bar_sessions', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  /** `YYYY-MM-DD`, the show night. A social or a get-out has no performances. */
  night: text('night').notNull(),
  // Empty rather than null: SQLite treats NULLs as distinct, which made the
  // one-open-session index constrain nothing.
  venue: text('venue').notNull().default(''),

  openedAt: integer('opened_at', { mode: 'timestamp' }).notNull(),
  openedByUserId: text('opened_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  closedByUserId: text('closed_by_user_id').references(() => users.id, { onDelete: 'set null' }),

  closingNote: text('closing_note'),
  checklist: text('checklist', { mode: 'json' }).$type<Record<string, boolean>>(),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  // At most one open session per night per venue (docs/13 §3.2).
  uniqueIndex('bar_sessions_open_unique').on(table.night, table.venue)
    .where(sql`closed_at is null`),
  index('bar_sessions_night_idx').on(table.night),
])

export const barSessionPerformances = sqliteTable('bar_session_performances', {
  sessionId: text('session_id').notNull().references(() => barSessions.id, { onDelete: 'cascade' }),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'cascade' }),
}, table => [
  primaryKey({ columns: [table.sessionId, table.performanceId] }),
])

export const barSessionPerformancesRelations = relations(barSessionPerformances, ({ one }) => ({
  session: one(barSessions, { fields: [barSessionPerformances.sessionId], references: [barSessions.id] }),
}))

/**
 * The reader's daily total, keyed on the DAY rather than a session, so a day
 * with no bar (a desk payment on a quiet afternoon) can still be reconciled.
 */
export const dayReconciliations = sqliteTable('day_reconciliations', {
  day: text('day').primaryKey(),
  sumupZPence: integer('sumup_z_pence').notNull(),
  enteredByUserId: text('entered_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  enteredAt: integer('entered_at', { mode: 'timestamp' }).notNull(),
  note: text('note'),
})
