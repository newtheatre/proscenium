import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

// A password step that has succeeded but has not yet been answered with a second factor
// (A-111). Short lived, and swept nightly by daily:sweeps.
export const mfaAttempts = sqliteTable('mfa_attempts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, table => [
  index('mfa_attempts_user').on(table.userId),
  index('mfa_attempts_expires_at').on(table.expiresAt),
])
