/**
 * The record of money taken in the building. One row per SumUp tap or comp,
 * whatever mix it covers (ADR-0023). Design: docs/13-bar-design.md §3
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { barDiscounts, barProducts } from './bar'
import { performances } from './show'
import { reservations } from './reservation'
import { users } from './user'

export const TRANSACTION_SOURCES = ['TILL', 'BOX_OFFICE_DESK'] as const
/** No cash, ever. The theatre takes none (docs/13 §1). */
export const TENDERS = ['CARD', 'COMP'] as const
export const LINE_KINDS = ['TICKET_PAYMENT', 'WALK_UP', 'BAR_ITEM', 'PASS_SALE'] as const

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  takenAt: integer('taken_at', { mode: 'timestamp' }).notNull(),
  /**
   * `YYYY-MM-DD` in Europe/London, computed server-side. The Worker runs in
   * UTC, so a 23:30 sale in August would otherwise land on tomorrow's Z.
   */
  takenOn: text('taken_on').notNull(),

  takenByUserId: text('taken_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  source: text('source', { enum: TRANSACTION_SOURCES }).notNull(),
  tender: text('tender', { enum: TENDERS }).notNull(),

  /** No FK yet: bar_sessions arrives with the till, and SQLite cannot add one later. */
  barSessionId: text('bar_session_id'),

  compReason: text('comp_reason'),
  compApprovedByUserId: text('comp_approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  compApprovedAt: integer('comp_approved_at', { mode: 'timestamp' }),

  // Snapshotted, so changing the committee rate next year does not rewrite
  // history. Applies to the bar subtotal only (docs/13 §4.1.1).
  discountId: text('discount_id').references(() => barDiscounts.id, { onDelete: 'set null' }),
  discountPercent: integer('discount_percent'),
  discountPence: integer('discount_pence').notNull().default(0),

  /** After discount: the figure a human typed into the reader. */
  totalPence: integer('total_pence').notNull(),

  voidedAt: integer('voided_at', { mode: 'timestamp' }),
  voidedByUserId: text('voided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  voidReason: text('void_reason'),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('transactions_taken_on_idx').on(table.takenOn),
  index('transactions_bar_session_idx').on(table.barSessionId),
])

export const transactionLines = sqliteTable('transaction_lines', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  transactionId: text('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),

  kind: text('kind', { enum: LINE_KINDS }).notNull(),
  /** Gross. The discount lives on the transaction, so product reports stay honest. */
  amountPence: integer('amount_pence').notNull(),

  reservationId: text('reservation_id').references(() => reservations.id, { onDelete: 'restrict' }),
  performanceId: text('performance_id').references(() => performances.id, { onDelete: 'restrict' }),

  productId: text('product_id').references(() => barProducts.id, { onDelete: 'restrict' }),
  qty: integer('qty'),
  unitPricePence: integer('unit_price_pence'),
  /** Snapshotted like a ticket's pricePaid, so a later price change is invisible here. */
  priceId: text('price_id'),
}, table => [
  index('transaction_lines_transaction_idx').on(table.transactionId),
  index('transaction_lines_kind_performance_idx').on(table.kind, table.performanceId),
])

export const transactionLinesRelations = relations(transactionLines, ({ one }) => ({
  transaction: one(transactions, { fields: [transactionLines.transactionId], references: [transactions.id] }),
}))
