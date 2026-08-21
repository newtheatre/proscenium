/**
 * Comp requests: the approval is the control, so the request is a row and the
 * transaction is not written until someone approves. Design: docs/13 §4.1.2
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'
import { transactions } from './transactions'

export const COMP_REASONS = ['CAST_CREW', 'COMMITTEE', 'SPILLAGE', 'OTHER'] as const
export const COMP_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'EXPIRED'] as const

/** A pending request is not a debt and not a sale: nothing moves until decided. */
export const compRequests = sqliteTable('comp_requests', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  /** No foreign key: a comp may be requested before the bar is opened. */
  barSessionId: text('bar_session_id'),
  night: text('night').notNull(),

  requestedByUserId: text('requested_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  requestedAt: text('requested_at').notNull().default(sql`(current_timestamp)`),

  reason: text('reason', { enum: COMP_REASONS }).notNull(),
  note: text('note'),

  /** The basket as asked for, snapshotted: prices may change before approval. */
  lines: text('lines', { mode: 'json' }).notNull().$type<CompLine[]>(),
  grossPence: integer('gross_pence').notNull(),

  status: text('status', { enum: COMP_STATUSES }).notNull().default('PENDING'),
  decidedByUserId: text('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: text('decided_at'),
  transactionId: text('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
}, table => [
  index('comp_requests_night_status_idx').on(table.night, table.status),
  index('comp_requests_requester_idx').on(table.requestedByUserId, table.status),
])

export interface CompLine {
  productId: string
  name: string
  qty: number
  unitPricePence: number
  priceId: string
}
