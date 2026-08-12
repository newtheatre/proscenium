import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * Thin mirror of the central NNT identity store (stage-door).
 *
 * Ids equal canonical auth-service ids: upserted from the shared session on
 * authenticated requests (ensureLocalUser), or created via the auth
 * service's shadow endpoint for guest checkout. Credentials, roles, and
 * verification live in the auth service — roles ride in the sealed session
 * and are read through the ability layer, never from this table.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  email: text('email').notNull().unique(), // lowercased, mirrors the canonical store
  name: text('name').notNull(),

  // Set when this user's identifying fields were replaced under the retention
  // policy. The row is kept so reservation history, repeat-booker counts and
  // revenue analysis survive; the person does not. (App-local scrub — central
  // erasure orchestration is stage-door Phase 7.)
  anonymisedAt: text('anonymised_at'),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('users_email_idx').on(table.email),
])
