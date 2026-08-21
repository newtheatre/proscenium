/**
 * The end-of-night report. The stored payload is the record; the email is a
 * courtesy copy of it. Design: docs/12-access-and-staffing-design.md §4
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'
import { performances } from './show'

export const performanceReports = sqliteTable('performance_reports', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'cascade' }),
  night: text('night').notNull(),

  /** Null when nobody signed off and the job closed it (docs/12 §4.1). */
  closedByUserId: text('closed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  closedAt: text('closed_at').notNull().default(sql`(current_timestamp)`),
  autoClosed: integer('auto_closed', { mode: 'boolean' }).notNull().default(false),

  closingNote: text('closing_note'),
  checklist: text('checklist', { mode: 'json' }).$type<Record<string, boolean>>(),

  /** Snapshotted, not re-derived: the report is what the night looked like. */
  payload: text('payload', { mode: 'json' }).notNull().$type<NightReport>(),
  emailedAt: text('emailed_at'),
}, table => [
  // One report per performance: closing twice is refused, so the job is idempotent.
  uniqueIndex('performance_reports_performance_unique').on(table.performanceId),
  index('performance_reports_night_idx').on(table.night),
])

export interface NightReport {
  performance: { id: string, showTitle: string, venueName: string, startsAt: string, night: string }
  attendance: { capacity: number | null, sold: number, collected: number, noShows: number, walkUps: number, passAdmissions: number }
  takings: { ticketsPence: number, walkUpPence: number, compPence: number, totalPence: number }
  /** Counts only, never needs and never names (docs/12 §2.5). */
  access: { bookingsWithNeeds: number, verified: number }
  incidents: Array<{ at: string, author: string | null, body: string }>
  milestones: Array<{ at: string, label: string }>
  staffing: Array<{ role: string, name: string | null, status: string }>
  bar: null | {
    sessionId: string
    takingsByTender: Array<{ tender: string, totalPence: number }>
    comps: Array<{ what: string, reason: string, requestedBy: string | null, approvedBy: string | null }>
    idChecks: { accepted: number, refused: number }
    lowStock: string[]
    closingNote: string | null
    unclosed: boolean
  }
}
