/**
 * Season and festival passes. Design and rationale:
 * docs/10-passes-design.md and docs/decisions/0002-passes-as-first-class-entities.md
 *
 * The one thing to understand before changing anything here: redeeming a pass
 * creates an ordinary `tickets` row priced at zero, and `pass_admissions` links
 * that ticket back to the pass. Capacity, the door list, "my bookings" and the
 * treasurer's export all keep working untouched because a pass admission *is* a
 * ticket. Do not add a parallel seat-counting path.
 *
 * Depends on `ticket_types.kind`, added by the legacy-import migration (0010).
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid, customAlphabet } from 'nanoid'
import { shows, performances } from './show'
import { users } from './user'
import { tickets } from './ticket'
import { reservations } from './reservation'

// Same unambiguous alphabet as reservations.bookingRef — no O/0, no I/L/1.
// Pass references get read aloud across a foyer desk.
const passRefId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

/* ------------------------------------------------------------------ *
 * Seasons
 * ------------------------------------------------------------------ */

/**
 * A programming period — "Autumn 2026", "Spring 2027".
 *
 * Orthogonal to show_categories (In House / Studio / StuFF / External), which
 * says what kind of show it is. Season says when. A pass is usually scoped to
 * one season and one or two categories, but it stores the resulting show list
 * explicitly rather than the rule — see passTypeShows.
 */
export const seasons = sqliteTable('seasons', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),

  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),

  sort: integer('sort').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('seasons_slug_unique').on(table.slug),
  index('seasons_starts_at_idx').on(table.startsAt),
])

export const seasonsRelations = relations(seasons, ({ many }) => ({
  shows: many(shows),
  passTypes: many(passTypes),
}))

/* ------------------------------------------------------------------ *
 * Pass products
 * ------------------------------------------------------------------ */

/**
 * A pass product — "Autumn 2026 Season Pass", "StuFF 2027 Festival Pass".
 *
 * Entitlement is unlimited within scope: one admission to every covered show,
 * for as long as the pass is valid. It does NOT reserve a seat — holders book
 * or turn up like anyone else and are subject to capacity. That is a terms-of-
 * sale matter as much as a code one.
 */
export const passTypes = sqliteTable('pass_types', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),

  seasonId: text('season_id').references(() => seasons.id, { onDelete: 'restrict' }),

  status: text('status', { enum: ['DRAFT', 'ON_SALE', 'CLOSED'] }).notNull().default('DRAFT'),

  /**
   * The window in which admissions may be redeemed. This is what makes a StuFF
   * Day Pass a normal pass rather than a special case: same scope as the
   * festival pass, validity of one calendar day.
   */
  validFrom: integer('valid_from', { mode: 'timestamp' }).notNull(),
  validTo: integer('valid_to', { mode: 'timestamp' }).notNull(),

  /** When it can be bought. NULL = whenever status is ON_SALE. */
  salesOpenAt: integer('sales_open_at', { mode: 'timestamp' }),
  salesCloseAt: integer('sales_close_at', { mode: 'timestamp' }),

  /**
   * Optional hard cap on issued passes. Sell 200 into an 86-seat house and a
   * popular night turns holders away; this is the blunt protection against that.
   */
  maxIssued: integer('max_issued'),

  transferable: integer('transferable', { mode: 'boolean' }).notNull().default(false),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('pass_types_slug_unique').on(table.slug),
  index('pass_types_season_id_idx').on(table.seasonId),
  index('pass_types_status_idx').on(table.status),
])

/**
 * Price variants — "Public £35", "NNT Member £28".
 *
 * Variants rather than separate pass types, so there is exactly one show list
 * per product and no way for the member and public versions to drift apart in
 * what they cover. Legacy kept these as two unrelated till counters, which is
 * precisely why the historic data cannot be analysed.
 */
export const passTypePrices = sqliteTable('pass_type_prices', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  passTypeId: text('pass_type_id').notNull().references(() => passTypes.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  price: integer('price').notNull(), // pence
  sort: integer('sort').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('pass_type_prices_pass_type_id_idx').on(table.passTypeId),
  uniqueIndex('pass_type_prices_unique').on(table.passTypeId, table.label),
])

/**
 * The scope: which shows this pass covers.
 *
 * Explicit rows rather than a stored rule (season + category), because shows get
 * added and pulled mid-season and a rule cannot say "everything except that one".
 * Seed it from a season, then edit. Adding a show after passes are sold grants it
 * to every existing holder — which is the behaviour you want, and it is one row.
 */
export const passTypeShows = sqliteTable('pass_type_shows', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  passTypeId: text('pass_type_id').notNull().references(() => passTypes.id, { onDelete: 'cascade' }),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('pass_type_shows_pass_type_id_idx').on(table.passTypeId),
  index('pass_type_shows_show_id_idx').on(table.showId),
  uniqueIndex('pass_type_shows_unique').on(table.passTypeId, table.showId),
])

export const passTypesRelations = relations(passTypes, ({ one, many }) => ({
  season: one(seasons, { fields: [passTypes.seasonId], references: [seasons.id] }),
  prices: many(passTypePrices),
  shows: many(passTypeShows),
  passes: many(passes),
}))

export const passTypePricesRelations = relations(passTypePrices, ({ one }) => ({
  passType: one(passTypes, { fields: [passTypePrices.passTypeId], references: [passTypes.id] }),
}))

export const passTypeShowsRelations = relations(passTypeShows, ({ one }) => ({
  passType: one(passTypes, { fields: [passTypeShows.passTypeId], references: [passTypes.id] }),
  show: one(shows, { fields: [passTypeShows.showId], references: [shows.id] }),
}))

/* ------------------------------------------------------------------ *
 * Issued passes
 * ------------------------------------------------------------------ */

/**
 * An issued pass, belonging to a person.
 *
 * The legacy system recorded no holder at all — 135 sales and 1,186 admissions
 * across a decade, all anonymous. Binding a pass to a user is the whole point of
 * doing this properly: renewals, replacement of a lost reference, and the first
 * answer the theatre has ever had to "who are our regulars?".
 *
 * userId uses `restrict` for the same reason reservations do: deleting a
 * customer must not silently destroy the record that they bought something.
 */
export const passes = sqliteTable('passes', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  passTypeId: text('pass_type_id').notNull().references(() => passTypes.id, { onDelete: 'restrict' }),
  passTypePriceId: text('pass_type_price_id').references(() => passTypePrices.id, { onDelete: 'set null' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),

  /** Short public code, read aloud at the door. */
  reference: text('reference').notNull().$defaultFn(() => passRefId()),

  status: text('status', { enum: ['ACTIVE', 'CANCELLED', 'EXPIRED'] }).notNull().default('ACTIVE'),

  /** Snapshot of what was actually taken, in pence. */
  pricePaid: integer('price_paid').notNull(),

  issuedAt: text('issued_at').notNull().default(sql`(current_timestamp)`),
  issuedByUserId: text('issued_by_user_id').references(() => users.id, { onDelete: 'set null' }),

  /** Set when the pass was sold as part of a door transaction. */
  reservationId: text('reservation_id').references(() => reservations.id, { onDelete: 'set null' }),

  notes: text('notes'),
  cancelledAt: text('cancelled_at'),
  cancelledBy: text('cancelled_by', { enum: ['CUSTOMER', 'STAFF'] }),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('passes_reference_unique').on(table.reference),
  index('passes_pass_type_id_idx').on(table.passTypeId),
  index('passes_user_id_idx').on(table.userId),
  index('passes_status_idx').on(table.status),
])

/**
 * The redemption ledger. One row per admission.
 *
 * `UNIQUE (pass_id, performance_id)` IS the entitlement rule. D1 has no
 * interactive transactions, so this index is the only thing that holds under a
 * double-submit — do not move this check into application code.
 *
 * `ticketId` is UNIQUE: one ticket is one admission, and the ticket is what
 * makes the admission visible to capacity, the door list and reporting.
 */
export const passAdmissions = sqliteTable('pass_admissions', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  passId: text('pass_id').notNull().references(() => passes.id, { onDelete: 'cascade' }),
  /**
   * `restrict`, not `cascade`: this row IS the record that a pass was used, and
   * the UNIQUE (pass_id, performance_id) below is the only thing stopping the
   * same pass admitting a second person to the same performance. Under
   * `cascade`, deleting the admission ticket — which the box-office ticket
   * stepper could do, since the £0 PASS_ADMISSION type appeared in its picker —
   * silently took the ledger row with it and made the pass redeemable again,
   * with nothing left to show it had ever been used.
   *
   * The application refuses those deletions first (`validateTicketTypesSellable`
   * on every ticket write path, and a 409 from `DELETE /api/reservations/:id`),
   * so a volunteer gets an explanation rather than a constraint error. This is
   * the backstop for the paths nobody has thought of yet. To un-redeem a pass,
   * delete the admission row and then its ticket, in that order.
   */
  ticketId: text('ticket_id').notNull().references(() => tickets.id, { onDelete: 'restrict' }),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'restrict' }),

  redeemedAt: text('redeemed_at').notNull().default(sql`(current_timestamp)`),
  /** NULL when the holder redeemed it themselves online. */
  redeemedByUserId: text('redeemed_by_user_id').references(() => users.id, { onDelete: 'set null' }),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  uniqueIndex('pass_admissions_ticket_unique').on(table.ticketId),
  uniqueIndex('pass_admissions_pass_performance_unique').on(table.passId, table.performanceId),
  index('pass_admissions_pass_id_idx').on(table.passId),
  index('pass_admissions_performance_id_idx').on(table.performanceId),
])

export const passesRelations = relations(passes, ({ one, many }) => ({
  passType: one(passTypes, { fields: [passes.passTypeId], references: [passTypes.id] }),
  price: one(passTypePrices, { fields: [passes.passTypePriceId], references: [passTypePrices.id] }),
  user: one(users, { fields: [passes.userId], references: [users.id] }),
  admissions: many(passAdmissions),
}))

export const passAdmissionsRelations = relations(passAdmissions, ({ one }) => ({
  pass: one(passes, { fields: [passAdmissions.passId], references: [passes.id] }),
  ticket: one(tickets, { fields: [passAdmissions.ticketId], references: [tickets.id] }),
  performance: one(performances, { fields: [passAdmissions.performanceId], references: [performances.id] }),
}))
