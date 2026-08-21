/**
 * Who is working a performance. The rota is a data-protection control as well
 * as a rostering one (ADR-0019, ADR-0022). Design: docs/12-access-and-staffing-design.md
 */
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { performances } from './show'
import { users } from './user'
import { venues } from './venue'

export const SHIFT_ROLES = ['DUTY_MANAGER', 'DOOR', 'BAR'] as const
export const SHIFT_STATUSES = ['OPEN', 'CLAIMED', 'CONFIRMED', 'DECLINED'] as const

/**
 * One slot on one performance. A null `userId` is an open slot, which is why
 * the status and the user column are constrained together below.
 */
export const performanceShifts = sqliteTable('performance_shifts', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  performanceId: text('performance_id').notNull()
    .references(() => performances.id, { onDelete: 'cascade' }),

  role: text('role', { enum: SHIFT_ROLES }).notNull(),

  // Null = nobody has this slot yet. Restrict, not cascade: a rota is a record
  // of who worked, and erasure anonymises the person rather than the shift.
  userId: text('user_id').references(() => users.id, { onDelete: 'restrict' }),

  status: text('status', { enum: SHIFT_STATUSES }).notNull().default('OPEN'),

  // Set when a claim was allowed under the eligibility fallback (ADR-0026), so
  // the manager can see what still needs a human look.
  needsEligibilityReview: integer('needs_eligibility_review', { mode: 'boolean' })
    .notNull().default(false),

  assignedByUserId: text('assigned_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  claimedAt: text('claimed_at'),
  confirmedAt: text('confirmed_at'),

  notes: text('notes'),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('performance_shifts_performance_id_idx').on(table.performanceId),
  index('performance_shifts_user_id_idx').on(table.userId),
  index('performance_shifts_status_idx').on(table.status),

  // The §3.1 invariant, held by the database rather than by every writer.
  uniqueIndex('performance_shifts_one_confirmed_dm')
    .on(table.performanceId)
    .where(sql`role = 'DUTY_MANAGER' and status = 'CONFIRMED'`),

  // An unfilled slot is OPEN; a filled one is not. Keeps "who is on" honest.
  check(
    'performance_shifts_user_matches_status',
    sql`(status = 'OPEN' and user_id is null) or (status <> 'OPEN' and user_id is not null)`,
  ),
])

export const performanceShiftsRelations = relations(performanceShifts, ({ one }) => ({
  performance: one(performances, {
    fields: [performanceShifts.performanceId],
    references: [performances.id],
  }),
  user: one(users, {
    fields: [performanceShifts.userId],
    references: [users.id],
  }),
  assignedBy: one(users, {
    fields: [performanceShifts.assignedByUserId],
    references: [users.id],
  }),
}))

/**
 * How many of each role a new performance gets. One row per role per venue;
 * a null `venueId` is the fallback used when a venue has no rows of its own.
 */
export const shiftTemplates = sqliteTable('shift_templates', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  venueId: text('venue_id').references(() => venues.id, { onDelete: 'cascade' }),
  role: text('role', { enum: SHIFT_ROLES }).notNull(),
  count: integer('count').notNull().default(1),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('shift_templates_venue_role_unique').on(table.venueId, table.role),
])

export const shiftTemplatesRelations = relations(shiftTemplates, ({ one }) => ({
  venue: one(venues, {
    fields: [shiftTemplates.venueId],
    references: [venues.id],
  }),
}))

/**
 * One row, `id = 'current'`. Trust levels differ year to year, so whether a
 * claim confirms itself is a season's decision (docs/12 §3.3).
 */
export const rotaSettings = sqliteTable('rota_settings', {
  id: text('id').primaryKey().$defaultFn(() => 'current'),
  autoConfirmClaims: integer('auto_confirm_claims', { mode: 'boolean' }).notNull().default(false),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
})
