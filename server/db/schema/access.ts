/**
 * Access needs: special category data, consent-gated, and visible only to the
 * people working that night (ADR-0022). Design: docs/12 §2
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'

export const ACCESS_STATUSES = ['PENDING', 'VERIFIED', 'EXPIRED', 'DECLINED', 'WITHDRAWN'] as const

/**
 * The nine Access Card symbols. Operational statements, never a diagnosis:
 * "needs level access", not why (docs/12 §2.2).
 */
export const ACCESS_NEEDS = [
  'difficultyStanding',
  'difficultyWithCrowds',
  'levelAccess',
  'distance',
  'urgentToilet',
  'visualInformation',
  'audibleInformation',
  'miscellaneous',
] as const

export const accessProfiles = sqliteTable('access_profiles', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  status: text('status', { enum: ACCESS_STATUSES }).notNull().default('PENDING'),

  /** Recorded only if the holder offers it. Evidence is viewed, never stored. */
  accessCardNumber: text('access_card_number'),

  difficultyStanding: integer('difficulty_standing', { mode: 'boolean' }).notNull().default(false),
  difficultyWithCrowds: integer('difficulty_with_crowds', { mode: 'boolean' }).notNull().default(false),
  levelAccess: integer('level_access', { mode: 'boolean' }).notNull().default(false),
  distance: integer('distance', { mode: 'boolean' }).notNull().default(false),
  urgentToilet: integer('urgent_toilet', { mode: 'boolean' }).notNull().default(false),
  visualInformation: integer('visual_information', { mode: 'boolean' }).notNull().default(false),
  audibleInformation: integer('audible_information', { mode: 'boolean' }).notNull().default(false),
  miscellaneous: integer('miscellaneous', { mode: 'boolean' }).notNull().default(false),

  /** Essential companion entitlement: +1 or +2. */
  companions: integer('companions').notNull().default(0),

  /** Written *with* the user and visible *to* them. No surprises. */
  fohNote: text('foh_note'),

  /**
   * Null means no consent and nothing is shown to anyone on a show night.
   * This timestamp is the lawful basis, so it is never inferred (ADR-0022).
   */
  consentFohAt: integer('consent_foh_at', { mode: 'timestamp' }),

  verifiedByUserId: text('verified_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('access_profiles_user_unique').on(table.userId),
  index('access_profiles_status_idx').on(table.status),
])

export const accessProfilesRelations = relations(accessProfiles, ({ one }) => ({
  user: one(users, { fields: [accessProfiles.userId], references: [users.id] }),
}))
