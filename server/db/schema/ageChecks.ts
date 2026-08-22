/**
 * The Challenge 25 register. Append-only, because one you can tidy is not
 * evidence (ADR-0027). Design: docs/13-bar-design.md §4.2
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { performances } from './show'
import { users } from './user'

export const AGE_CHECK_OUTCOMES = ['ACCEPTED', 'REFUSED'] as const
export const AGE_CHECK_REASONS = ['NO_ID', 'ID_NOT_ACCEPTED', 'UNDER_25_NO_ID', 'INTOXICATED', 'PROXY', 'OTHER'] as const

/**
 * One ID check. `ACCEPTED` rows are a bare tally: the ratio of accepted to
 * refused is the evidence that Challenge 25 is operated, not just displayed.
 */
export const ageChecks = sqliteTable('age_checks', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  performanceId: text('performance_id').references(() => performances.id, { onDelete: 'restrict' }),
  checkedByUserId: text('checked_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),

  outcome: text('outcome', { enum: AGE_CHECK_OUTCOMES }).notNull(),
  reason: text('reason', { enum: AGE_CHECK_REASONS }),

  /** What they asked for, not who they were. */
  productDescription: text('product_description'),
  /** "Tall man, grey coat": for the register, never a name (ADR-0027). */
  description: text('description'),
  notes: text('notes'),

  /** A correction points at what it corrects; both stay, in order. */
  supersedesId: text('supersedes_id'),

  checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull(),
}, table => [
  index('age_checks_checked_at_idx').on(table.checkedAt),
  index('age_checks_performance_idx').on(table.performanceId),
])

export const ageChecksRelations = relations(ageChecks, ({ one }) => ({
  performance: one(performances, { fields: [ageChecks.performanceId], references: [performances.id] }),
  checkedBy: one(users, { fields: [ageChecks.checkedByUserId], references: [users.id] }),
}))
