import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// The bar: what is stocked, what is sold over it, and every movement of stock. On-hand is always
// the sum of movements and no column here holds a balance (F-114 criterion 2).

// The till's layout, ordered by `sort`. The order is read at request time, so changing it is a
// save rather than a deploy (F-111 criterion 4).
export const barCategories = sqliteTable('bar_categories', {
  id: id(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
  colour: text('colour'),
}, table => [
  unique('bar_categories_name').on(table.name),
  uniqueIndex('bar_categories_name_nocase').on(sql`${table.name} COLLATE NOCASE`),
  check('bar_categories_colour_hex', sql`${table.colour} IS NULL OR ${table.colour} GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'`),
])

// A sellable thing. Its serving sizes, its recipe and its prices arrive as their own tables
// (F-112, F-113, F-116); a product carries what the till has to show beside the buttons.
export const barProducts = sqliteTable('bar_products', {
  id: id(),
  categoryId: text('category_id').notNull().references(() => barCategories.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  // A new product is hidden until it has what it needs to be sold, which is the write path's
  // question rather than a column's (F-111 criterion 2).
  status: text('status').notNull().default('HIDDEN'),
  staffedOnly: integer('staffed_only', { mode: 'boolean' }).notNull().default(false),
  ageRestricted: integer('age_restricted', { mode: 'boolean' }).notNull().default(false),
  allergenState: text('allergen_state').notNull().default('UNKNOWN'),
  // The note the till shows, which has to cover the product's ingredients (F-107 criterion 4).
  // `bar_items.allergen_notes` is the per-item reference a manager writes it from.
  allergenNote: text('allergen_note'),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  unique('bar_products_name').on(table.name),
  uniqueIndex('bar_products_name_nocase').on(sql`${table.name} COLLATE NOCASE`),
  index('bar_products_category').on(table.categoryId, table.sort),
  check('bar_products_status_values', sql`${table.status} IN ('ACTIVE', 'HIDDEN', 'RETIRED')`),
  check('bar_products_allergen_state_values', sql`${table.allergenState} IN ('UNKNOWN', 'NONE', 'RECORDED')`),
  check('bar_products_recorded_allergens_have_a_note', sql`${table.allergenState} <> 'RECORDED' OR ${table.allergenNote} IS NOT NULL`),
  check('bar_products_unknown_allergens_have_no_note', sql`${table.allergenState} <> 'UNKNOWN' OR ${table.allergenNote} IS NULL`),
])

// A stocked thing, counted in its own real unit. Retired once it has moved, never deleted, which
// the restrict on every movement enforces (F-114 criterion 1).
export const barItems = sqliteTable('bar_items', {
  id: id(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  containerMl: integer('container_ml'),
  parQty: integer('par_qty'),
  ageRestricted: integer('age_restricted', { mode: 'boolean' }).notNull().default(true),
  allergenNotes: text('allergen_notes'),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  unique('bar_items_name').on(table.name),
  uniqueIndex('bar_items_name_nocase').on(sql`${table.name} COLLATE NOCASE`),
  check('bar_items_unit_values', sql`${table.unit} IN ('ML', 'ITEM')`),
  check('bar_items_status_values', sql`${table.status} IN ('ACTIVE', 'RETIRED')`),
  check('bar_items_container_is_measured', sql`${table.containerMl} IS NULL OR (${table.unit} = 'ML' AND ${table.containerMl} > 0)`),
  check('bar_items_par_not_negative', sql`${table.parQty} IS NULL OR ${table.parQty} >= 0`),
])

// APPEND-ONLY (0010). The triggers are hand-authored after this table's generated CREATE, because
// a rebuild would drop what no snapshot carries and a rebuild here is refused outright.
export const stockMovements = sqliteTable('stock_movements', {
  id: id(),
  itemId: text('item_id').notNull().references(() => barItems.id, { onDelete: 'restrict' }),
  // Signed, in the item's own unit: positive adds and negative takes away.
  qty: integer('qty').notNull(),
  kind: text('kind').notNull(),
  reason: text('reason'),
  // Delivered cost, which is what gross profit is measured against (F-114 criterion 6, F-119).
  unitCostPence: integer('unit_cost_pence'),
  // The document this movement came from, so any on-hand figure audits to its causes.
  refTable: text('ref_table'),
  refId: text('ref_id'),
  reversesId: text('reverses_id').references((): AnySQLiteColumn => stockMovements.id, { onDelete: 'restrict' }),
  // Null is the system acting. A user is anonymised in place and never deleted, so restrict here
  // still resolves after an erasure (0011).
  actorId: text('actor_id').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('stock_movements_item').on(table.itemId, table.createdAt),
  index('stock_movements_kind').on(table.kind, table.createdAt),
  // A movement is corrected once, or the correction of the correction hides behind it.
  uniqueIndex('stock_movements_one_reversal').on(table.reversesId),
  // A duplicate finish rolls the whole stocktake batch back (F-115 criterion 4).
  uniqueIndex('stock_movements_stocktake_line').on(table.refId).where(sql`ref_table = 'stocktake_lines'`),
  check('stock_movements_kind_values', sql`${table.kind} IN ('DELIVERY', 'SALE', 'COMP', 'STOCKTAKE', 'WASTAGE', 'TRANSFER', 'ADJUST', 'REVERSAL')`),
  check('stock_movements_qty_moves_something', sql`${table.qty} <> 0`),
  check('stock_movements_delivery_adds', sql`${table.kind} <> 'DELIVERY' OR ${table.qty} > 0`),
  check('stock_movements_wastage_takes_away_with_a_reason', sql`${table.kind} <> 'WASTAGE' OR (${table.qty} < 0 AND ${table.reason} IS NOT NULL)`),
  check('stock_movements_cost_is_a_delivery_fact', sql`${table.unitCostPence} IS NULL OR (${table.kind} = 'DELIVERY' AND ${table.unitCostPence} >= 0)`),
  check('stock_movements_reversal_names_what_it_reverses', sql`(${table.reversesId} IS NOT NULL) = (${table.kind} = 'REVERSAL')`),
  check('stock_movements_source_document_is_whole', sql`(${table.refTable} IS NULL) = (${table.refId} IS NULL)`),
])

// A size is a row, never a duplicate product (0017). The serving kind keys a category default
// (F-121), so its vocabulary is in `shared/utils/bar.ts` rather than a CHECK a new size rebuilds.
export const productVariants = sqliteTable('product_variants', {
  id: id(),
  productId: text('product_id').notNull().references(() => barProducts.id, { onDelete: 'cascade' }),
  servingKind: text('serving_kind').notNull(),
  label: text('label').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  unique('product_variants_kind').on(table.productId, table.servingKind),
  index('product_variants_product').on(table.productId, table.sort),
  check('product_variants_status_values', sql`${table.status} IN ('ACTIVE', 'RETIRED')`),
])

// A choice a variant offers, such as the mixer with a spirit. Its options are stocked items, so a
// chosen one depletes at its own quantity (0017, F-113 criterion 2).
export const choiceGroups = sqliteTable('choice_groups', {
  id: id(),
  name: text('name').notNull(),
}, table => [
  // NOCASE alone is stricter than a plain UNIQUE, so a second index would only duplicate it.
  uniqueIndex('choice_groups_name_nocase').on(sql`${table.name} COLLATE NOCASE`),
])

export const choiceGroupItems = sqliteTable('choice_group_items', {
  id: id(),
  choiceGroupId: text('choice_group_id').notNull().references(() => choiceGroups.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull().references(() => barItems.id, { onDelete: 'restrict' }),
  qty: integer('qty').notNull(),
  sort: integer('sort').notNull().default(0),
}, table => [
  unique('choice_group_items_option').on(table.choiceGroupId, table.itemId),
  check('choice_group_items_qty_positive', sql`${table.qty} > 0`),
])

// What pouring one of these consumes. One level deep by construction: a component names a stocked
// item or a choice of them, and never another product (F-113 criterion 1).
export const variantComponents = sqliteTable('variant_components', {
  id: id(),
  variantId: text('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  itemId: text('item_id').references(() => barItems.id, { onDelete: 'restrict' }),
  choiceGroupId: text('choice_group_id').references(() => choiceGroups.id, { onDelete: 'restrict' }),
  // In the item's own counting unit, and independent of price: a double may deplete twice a
  // single without costing twice as much (F-112 criterion 2).
  qty: integer('qty').notNull(),
  includedInPrice: integer('included_in_price', { mode: 'boolean' }).notNull().default(false),
}, table => [
  uniqueIndex('variant_components_item').on(table.variantId, table.itemId),
  uniqueIndex('variant_components_choice').on(table.variantId, table.choiceGroupId),
  check('variant_components_one_source', sql`(${table.itemId} IS NULL) <> (${table.choiceGroupId} IS NULL)`),
  check('variant_components_qty_positive', sql`${table.qty} > 0`),
])

// APPEND-ONLY (0010), with its triggers hand-authored after this generated CREATE. The latest row
// dated on or before today wins, and same-day rows resolve by `created_at` (F-116).
export const variantPrices = sqliteTable('variant_prices', {
  id: id(),
  variantId: text('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  pricePence: integer('price_pence').notNull(),
  // A civil date, the Europe/London day it takes effect on. A future one is allowed and waits.
  effectiveFrom: text('effective_from').notNull(),
  createdAt: integer('created_at').notNull().default(now),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'restrict' }),
}, table => [
  index('variant_prices_resolution').on(table.variantId, table.effectiveFrom, table.createdAt),
  check('variant_prices_pence', sql`${table.pricePence} >= 0`),
  check('variant_prices_effective_from_is_a_date', sql`${table.effectiveFrom} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
])
