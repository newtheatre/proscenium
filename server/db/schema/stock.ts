/**
 * The stock ledger. Quantities in the product's own basis, signed: on-hand is
 * always SUM(qty) and is never stored. Design: docs/13-bar-design.md §3
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'
import { barProducts } from './bar'

export const MOVEMENT_KINDS = ['DELIVERY', 'SALE', 'COMP', 'STOCKTAKE', 'WASTAGE', 'TRANSFER', 'ADJUST', 'VOID'] as const
export const STOCKTAKE_STATUSES = ['OPEN', 'APPLIED', 'ABANDONED'] as const

/**
 * Append-only. Every row is written from `server/utils/stock.ts` and nowhere
 * else; a mistake is corrected with an opposing movement, never an edit.
 */
export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  /** Always a stock product: one with no recipe rows of its own (§3.1). */
  productId: text('product_id').notNull().references(() => barProducts.id, { onDelete: 'restrict' }),
  /** Signed, in the product's basis: millilitres, or whole items. */
  qty: integer('qty').notNull(),
  kind: text('kind', { enum: MOVEMENT_KINDS }).notNull(),

  /** What caused it, for tracing back without a foreign key per kind. */
  refTable: text('ref_table'),
  refId: text('ref_id'),

  costPencePerContainer: integer('cost_pence_per_container'),
  reason: text('reason'),

  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('stock_movements_product_idx').on(table.productId),
  index('stock_movements_ref_idx').on(table.refTable, table.refId),
  index('stock_movements_created_idx').on(table.createdAt),
  // A stocktake line yields at most one movement, so a duplicate finish fails
  // the insert and D1 rolls its whole batch back. Partial: a sale is one-to-many.
  uniqueIndex('stock_movements_stocktake_line_uq').on(table.refId)
    .where(sql`ref_table = 'stocktake_lines'`),
])

export const stockDeliveries = sqliteTable('stock_deliveries', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  supplier: text('supplier').notNull(),
  /** `YYYY-MM-DD` in Europe/London. */
  deliveredOn: text('delivered_on').notNull(),
  invoiceRef: text('invoice_ref'),
  totalPence: integer('total_pence'),
  notes: text('notes'),

  receivedByUserId: text('received_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('stock_deliveries_date_idx').on(table.deliveredOn),
])

export const stockDeliveryLines = sqliteTable('stock_delivery_lines', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  deliveryId: text('delivery_id').notNull().references(() => stockDeliveries.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => barProducts.id, { onDelete: 'restrict' }),
  qty: integer('qty').notNull(),
  /** Per container, not per millilitre. The latest is what stock is valued at. */
  costPencePerContainer: integer('cost_pence_per_container'),
}, table => [
  index('stock_delivery_lines_delivery_idx').on(table.deliveryId),
  index('stock_delivery_lines_product_idx').on(table.productId),
])

export const stocktakes = sqliteTable('stocktakes', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  status: text('status', { enum: STOCKTAKE_STATUSES }).notNull().default('OPEN'),
  notes: text('notes'),

  startedByUserId: text('started_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  startedAt: text('started_at').notNull().default(sql`(current_timestamp)`),
  finishedByUserId: text('finished_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  finishedAt: text('finished_at'),
}, table => [
  index('stocktakes_status_idx').on(table.status),
  // At most one open take at a time (docs/03 §stocktakes), held here because a
  // read-then-insert cannot hold it across two requests.
  uniqueIndex('stocktakes_one_open').on(table.status).where(sql`status = 'OPEN'`),
])

export const stocktakeLines = sqliteTable('stocktake_lines', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  stocktakeId: text('stocktake_id').notNull().references(() => stocktakes.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => barProducts.id, { onDelete: 'restrict' }),
  /** On-hand at the moment the take started, so trading during it is visible. */
  expectedQty: integer('expected_qty').notNull(),
  countedQty: integer('counted_qty'),
  reason: text('reason'),
}, table => [
  index('stocktake_lines_stocktake_idx').on(table.stocktakeId),
])
