/**
 * The bar catalogue. Money in integer pence, stock in millilitres or whole
 * items. Design: docs/13-bar-design.md §3
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { users } from './user'
import { PRODUCT_STATUSES, PRODUCT_UNITS } from '../../../shared/utils/barCatalogue'

export { PRODUCT_STATUSES, PRODUCT_UNITS }

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
   * Millilitres in one container: 700 for a 70 cl bottle. Null counts this in
   * whole items, and it may not change once movements exist (ADR-0035).
   */
  containerMl: integer('container_ml'),
  /** Stocked but never sold: a spirits bottle poured only as measures. */
  stockOnly: integer('stock_only', { mode: 'boolean' }).notNull().default(false),

  /** Flags the product below this level, in its own basis. */
  parQty: integer('par_qty'),
  status: text('status', { enum: PRODUCT_STATUSES }).notNull().default('ACTIVE'),
  sort: integer('sort').notNull().default(0),
  ageRestricted: integer('age_restricted', { mode: 'boolean' }).notNull().default(true),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('bar_products_category_idx').on(table.categoryId, table.sort),
])

export const barProductsRelations = relations(barProducts, ({ many, one }) => ({
  category: one(barCategories, { fields: [barProducts.categoryId], references: [barCategories.id] }),
  recipe: many(barRecipeItems),
}))

/**
 * What a sold product is made of. No rows means it holds its own stock, and an
 * ingredient must hold its own stock too: one level (docs/13 §3.1).
 */
export const barRecipeItems = sqliteTable('bar_recipe_items', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  productId: text('product_id').notNull().references(() => barProducts.id, { onDelete: 'cascade' }),

  /** A fixed ingredient, or null when the till picks one from the category. */
  componentProductId: text('component_product_id').references(() => barProducts.id, { onDelete: 'restrict' }),
  /** Exactly one of these two is set, checked by the API (ADR-0036). */
  choiceCategoryId: text('choice_category_id').references(() => barCategories.id, { onDelete: 'restrict' }),

  /** In the ingredient's own basis: 25 for a single, 1 for a can of tonic. */
  qty: integer('qty').notNull(),
  sort: integer('sort').notNull().default(0),
}, table => [
  index('bar_recipe_items_product_idx').on(table.productId, table.sort),
  index('bar_recipe_items_component_idx').on(table.componentProductId),
])

export const barRecipeItemsRelations = relations(barRecipeItems, ({ one }) => ({
  product: one(barProducts, { fields: [barRecipeItems.productId], references: [barProducts.id] }),
  component: one(barProducts, { fields: [barRecipeItems.componentProductId], references: [barProducts.id] }),
  choiceCategory: one(barCategories, { fields: [barRecipeItems.choiceCategoryId], references: [barCategories.id] }),
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
