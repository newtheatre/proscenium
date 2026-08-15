import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * Thin mirror of the central identity store; ids are the canonical auth-service
 * ids. Credentials and roles live there, never here.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  email: text('email').notNull().unique(), // lowercased, mirrors the canonical store
  name: text('name').notNull(),

  // Set when identifying fields were replaced under the retention policy. The row
  // survives so booking history and revenue analysis do (ADR-0014).
  anonymisedAt: text('anonymised_at'),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('users_email_idx').on(table.email),
])
