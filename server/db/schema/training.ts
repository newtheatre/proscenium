/**
 * Training mode's own tables, and the ONLY ones a training request may write
 * (ADR-0032). Nothing else in this app reads them. Design: docs/14
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'

export const TRAINING_TARGETS = ['bar-till', 'challenge-25', 'door-scan'] as const
export const TRAINING_END_REASONS = ['ENDED', 'EXPIRED', 'PURGED'] as const

export const trainingRuns = sqliteTable('training_runs', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  /** rehearsal's practice-target key. This app hardcodes the three, not modules. */
  targetKey: text('target_key', { enum: TRAINING_TARGETS }).notNull(),
  /** rehearsal's session id, kept only so a trainer can find the lesson again. */
  trainingSessionId: text('training_session_id'),

  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  /** Straight from rehearsal: this app never extends a sandbox. */
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),

  endedAt: integer('ended_at', { mode: 'timestamp' }),
  endedReason: text('ended_reason', { enum: TRAINING_END_REASONS }),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('training_runs_user_idx').on(table.userId, table.endedAt),
  index('training_runs_expires_idx').on(table.expiresAt),
])

export const TRAINING_EVENT_KINDS = ['SALE', 'AGE_CHECK', 'ADMISSION', 'LOOKUP'] as const

/**
 * What a trainee did, for the debrief and the banner's tally. Scratch data:
 * nothing aggregates it and it is deleted with the run.
 */
export const trainingRunEvents = sqliteTable('training_run_events', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  runId: text('run_id').notNull().references(() => trainingRuns.id, { onDelete: 'cascade' }),

  kind: text('kind', { enum: TRAINING_EVENT_KINDS }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),

  at: integer('at', { mode: 'timestamp' }).notNull(),
}, table => [
  index('training_run_events_run_idx').on(table.runId, table.at),
])

export const trainingRunsRelations = relations(trainingRuns, ({ one, many }) => ({
  user: one(users, { fields: [trainingRuns.userId], references: [users.id] }),
  events: many(trainingRunEvents),
}))

export const trainingRunEventsRelations = relations(trainingRunEvents, ({ one }) => ({
  run: one(trainingRuns, { fields: [trainingRunEvents.runId], references: [trainingRuns.id] }),
}))
