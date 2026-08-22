/**
 * Asking for a pass. Not a pass: nothing here admits anyone, and no pass row
 * exists until the box office takes the money (ADR-0028).
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'
import { passTypes, passes } from './passes'

export const PASS_REQUEST_STATUSES = ['PENDING', 'FULFILLED', 'DECLINED', 'EXPIRED'] as const

export const passRequests = sqliteTable('pass_requests', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  passTypeId: text('pass_type_id').notNull().references(() => passTypes.id, { onDelete: 'restrict' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),

  status: text('status', { enum: PASS_REQUEST_STATUSES }).notNull().default('PENDING'),
  /** What the requester was shown, which is not what they are charged. */
  quotedPence: integer('quoted_pence'),
  note: text('note'),

  requestedAt: text('requested_at').notNull().default(sql`(current_timestamp)`),
  decidedByUserId: text('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: text('decided_at'),
  /** Set when fulfilled: the pass the box office actually issued. */
  passId: text('pass_id').references(() => passes.id, { onDelete: 'set null' }),
}, table => [
  index('pass_requests_status_idx').on(table.status, table.requestedAt),
  index('pass_requests_user_idx').on(table.userId, table.status),
])
