import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { shows } from './programme'

const id = () => text('id').primaryKey()

// A pass product: what it covers, when it may be sold, when it is valid, and its price points
// (D-123). Issuing one is D-124's `passes` table, which does not exist yet.

export const passTypes = sqliteTable('pass_types', {
  id: id(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('DRAFT'),
  validFrom: integer('valid_from').notNull(),
  validUntil: integer('valid_until').notNull(),
  salesOpenAt: integer('sales_open_at'),
  salesCloseAt: integer('sales_close_at'),
  // Null is uncapped. The blunt guard against selling 200 passes into an 86-seat house.
  maxIssued: integer('max_issued'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, table => [
  unique('pass_types_slug').on(table.slug),
  check('pass_types_status_values', sql`${table.status} IN ('DRAFT', 'ON_SALE', 'CLOSED')`),
  check('pass_types_valid_window', sql`${table.validUntil} >= ${table.validFrom}`),
  check('pass_types_max_issued_positive', sql`${table.maxIssued} IS NULL OR ${table.maxIssued} > 0`),
  check('pass_types_sales_window', sql`${table.salesCloseAt} IS NULL OR ${table.salesOpenAt} IS NULL OR ${table.salesCloseAt} >= ${table.salesOpenAt}`),
])

export const passTypePrices = sqliteTable('pass_type_prices', {
  id: id(),
  passTypeId: text('pass_type_id').notNull().references(() => passTypes.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  price: integer('price').notNull(),
}, table => [
  unique('pass_type_prices_pair').on(table.passTypeId, table.label),
  check('pass_type_prices_price_pence', sql`${table.price} >= 0`),
])

export const passTypeShows = sqliteTable('pass_type_shows', {
  id: id(),
  passTypeId: text('pass_type_id').notNull().references(() => passTypes.id, { onDelete: 'cascade' }),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'restrict' }),
}, table => [
  unique('pass_type_shows_pair').on(table.passTypeId, table.showId),
])
