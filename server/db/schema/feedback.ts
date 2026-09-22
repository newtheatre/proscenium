import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`

// A report from a signed-in screen, waiting for the daily triage run (K-134, 0086). Mutable by
// design: status and the issue link are written from outside the worker, so this is not append-only.
export const feedbackReports = sqliteTable('feedback_reports', {
  id: text('id').primaryKey(),
  reporterId: text('reporter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  body: text('body').notNull(),
  pagePath: text('page_path').notNull(),
  shell: text('shell').notNull(),
  userAgent: text('user_agent'),
  recentFailures: text('recent_failures', { mode: 'json' }),
  status: text('status').notNull().default('NEW'),
  issueUrl: text('issue_url'),
  triagedAt: integer('triaged_at'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('feedback_reports_status').on(table.status, table.createdAt),
  index('feedback_reports_reporter').on(table.reporterId),
  check('feedback_reports_kind_values', sql`${table.kind} IN ('BUG', 'IDEA')`),
  check('feedback_reports_shell_values', sql`${table.shell} IN ('console', 'tonight')`),
  check('feedback_reports_status_values', sql`${table.status} IN ('NEW', 'TRIAGED', 'DONE', 'DISMISSED')`),
  // A NEW row has been claimed by nobody; anything else names the issue and the moment.
  check('feedback_reports_triage_is_whole', sql`(${table.status} = 'NEW') = (${table.issueUrl} IS NULL AND ${table.triagedAt} IS NULL)`),
])
