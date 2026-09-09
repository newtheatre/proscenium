import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { users } from './identity'
import { performances, shows } from './programme'
import { tickets } from './ticketing'

const id = () => text('id').primaryKey()
const now = sql`(unixepoch())`

// A pass product: what it covers, when it may be sold, when it is valid, and its price points
// (D-123). Issuing one is D-124's `passes` table below.

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

// A held pass (D-124). `reference` is the holder's own retrieval key, the same no-look-alike
// shape a reservation's is; issuing posts a PASS_SALE ledger entry in the same batch.
export const passes = sqliteTable('passes', {
  id: id(),
  reference: text('reference').notNull(),
  passTypeId: text('pass_type_id').notNull().references(() => passTypes.id, { onDelete: 'restrict' }),
  passTypePriceId: text('pass_type_price_id').notNull().references(() => passTypePrices.id, { onDelete: 'restrict' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  // Integer pence, snapshotted from the price point at issue: a later price change never
  // reprices a pass already sold (the same rule D-120 applies to tickets).
  pricePaid: integer('price_paid').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  issuedBy: text('issued_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  unique('passes_reference').on(table.reference),
  index('passes_user').on(table.userId),
  index('passes_pass_type').on(table.passTypeId),
  check('passes_status_values', sql`${table.status} IN ('ACTIVE', 'CANCELLED', 'EXPIRED')`),
  check('passes_price_paid_pence', sql`${table.pricePaid} >= 0`),
])

// Append-only (0010), the same reasoning as the ledger: D-124 only creates this table; issuing a
// pass admits nobody (D-125 self-serve, D-126 the door, both still to build).
export const passAdmissions = sqliteTable('pass_admissions', {
  id: id(),
  passId: text('pass_id').notNull().references(() => passes.id, { onDelete: 'restrict' }),
  // Everything record-like keys to a performance, never a day or a venue: a pass covers a show's
  // run, but one admission is always to one specific performance of it.
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'restrict' }),
  ticketId: text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'restrict' }),
  admittedAt: integer('admitted_at').notNull().default(now),
  // NULL means self-serve: nobody on the door needed to act for a QR scan to admit (D-125, D-126).
  admittedBy: text('admitted_by').references(() => users.id, { onDelete: 'restrict' }),
}, table => [
  unique('pass_admissions_ticket').on(table.ticketId),
  // The once-per-performance rule: a season pass covers the run, not every seat in it at once.
  unique('pass_admissions_pass_performance').on(table.passId, table.performanceId),
  index('pass_admissions_pass').on(table.passId),
  index('pass_admissions_performance').on(table.performanceId),
])

// A request reserves nothing and admits nobody (criterion 3): it is a name on a list for the
// desk to fulfil at payment, or the sweep to lapse once the product's sales window closes.
export const passRequests = sqliteTable('pass_requests', {
  id: id(),
  passTypeId: text('pass_type_id').notNull().references(() => passTypes.id, { onDelete: 'restrict' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('PENDING'),
  note: text('note'),
  decidedBy: text('decided_by').references(() => users.id, { onDelete: 'restrict' }),
  // Set once fulfilled; a declined or expired request never gains one.
  passId: text('pass_id').references(() => passes.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at').notNull().default(now),
  decidedAt: integer('decided_at'),
}, table => [
  index('pass_requests_pass_type_status').on(table.passTypeId, table.status),
  index('pass_requests_user').on(table.userId),
  check('pass_requests_status_values', sql`${table.status} IN ('PENDING', 'FULFILLED', 'DECLINED', 'EXPIRED')`),
  // A pass is set exactly when fulfilment decided it, never on any other status (0033).
  check('pass_requests_pass_pairs_with_fulfilled', sql`(${table.status} = 'FULFILLED') = (${table.passId} IS NOT NULL)`),
])
