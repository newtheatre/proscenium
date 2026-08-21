/**
 * The bar catalogue. Money in integer pence, quantities in thousandths of a
 * unit. Design: docs/13-bar-design.md §3
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'

export const PRODUCT_UNITS = ['bottle', 'can', 'measure', 'glass', 'each'] as const
export const PRODUCT_STATUSES = ['ACTIVE', 'HIDDEN', 'RETIRED'] as const

export const barCategories = sqliteTable('bar_categories', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(),
  sort: integer('sort').notNull().default(0),
  colour: text('colour'),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
})

export const barProducts = sqliteTable('bar_products', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  categoryId: text('category_id').notNull().references(() => barCategories.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  unit: text('unit', { enum: PRODUCT_UNITS }).notNull().default('each'),

  /**
   * What a sale of this depletes. A 175ml glass points at the 750ml bottle;
   * a bottled beer points at itself. One level only (docs/13 §3.1).
   */
  stockProductId: text('stock_product_id'),
  /** Thousandths of the stock product per sale: a 175ml glass of 750ml is 233. */
  depletesMilli: integer('depletes_milli').notNull().default(1000),

  parMilli: integer('par_milli'),
  status: text('status', { enum: PRODUCT_STATUSES }).notNull().default('ACTIVE'),
  sort: integer('sort').notNull().default(0),
  ageRestricted: integer('age_restricted', { mode: 'boolean' }).notNull().default(true),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('bar_products_category_idx').on(table.categoryId, table.sort),
])

export const barProductsRelations = relations(barProducts, ({ one }) => ({
  category: one(barCategories, { fields: [barProducts.categoryId], references: [barCategories.id] }),
}))

/**
 * Append-only by convention: a price change is a new row, never an update, so
 * the history *is* the audit trail. Current price is a query (docs/13 §3).
 */
export const barPrices = sqliteTable('bar_prices', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  productId: text('product_id').notNull().references(() => barProducts.id, { onDelete: 'cascade' }),
  pricePence: integer('price_pence').notNull(),
  /** `YYYY-MM-DD`. The latest one on or before today wins. */
  effectiveFrom: text('effective_from').notNull(),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  uniqueIndex('bar_prices_product_from_unique').on(table.productId, table.effectiveFrom),
  index('bar_prices_product_idx').on(table.productId, table.effectiveFrom),
])

/** Percentage, bar lines only, snapshotted onto a transaction when used. */
export const barDiscounts = sqliteTable('bar_discounts', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  percent: integer('percent').notNull(),
  status: text('status', { enum: ['ACTIVE', 'RETIRED'] }).notNull().default('ACTIVE'),
  sort: integer('sort').notNull().default(0),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
})
