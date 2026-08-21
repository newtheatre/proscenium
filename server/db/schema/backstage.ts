/**
 * The backstage board's access model: a code per performance day, and the
 * devices that joined with it (ADR-0020). Design: docs/11 §5.1
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'

/**
 * One row per night. **The code itself is never stored**, in any form: it is
 * derived from the night and the epoch, so a database dump reveals nothing.
 */
export const backstageNights = sqliteTable('backstage_nights', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  /** `YYYY-MM-DD`, the show night the code belongs to. */
  night: text('night').notNull(),

  /** Bumped by a reset, and by too many failed joins. Every session goes stale. */
  epoch: integer('epoch').notNull().default(0),

  /** 02:00 the following morning, unless the night is closed sooner. */
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  closedAt: integer('closed_at', { mode: 'timestamp' }),

  /** Reset once past the threshold, so a guesser achieves a rotation, not a join. */
  failedAttempts: integer('failed_attempts').notNull().default(0),

  lastResetByUserId: text('last_reset_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  lastResetAt: integer('last_reset_at', { mode: 'timestamp' }),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('backstage_nights_night_unique').on(table.night),
])

/**
 * A joined device. Holds no user: the name is what someone typed, and
 * attribution here is social rather than authenticated (ADR-0020).
 */
export const backstageSessions = sqliteTable('backstage_sessions', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  nightId: text('night_id').notNull().references(() => backstageNights.id, { onDelete: 'cascade' }),

  /** The epoch at join. Below the night's current epoch means kicked. */
  epoch: integer('epoch').notNull(),
  /** SHA-256 of the bearer token; the token itself only ever lives in a cookie. */
  tokenHash: text('token_hash').notNull(),

  deviceName: text('device_name'),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
}, table => [
  index('backstage_sessions_night_idx').on(table.nightId),
  uniqueIndex('backstage_sessions_token_unique').on(table.tokenHash),
])

export const backstageSessionsRelations = relations(backstageSessions, ({ one }) => ({
  night: one(backstageNights, { fields: [backstageSessions.nightId], references: [backstageNights.id] }),
}))
