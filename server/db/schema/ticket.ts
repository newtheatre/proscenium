import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { shows, performances } from './show'
import { reservations } from './reservation'

// Base ticket type definitions shared across all shows/performances
export const ticketTypes = sqliteTable('ticket_types', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(), // e.g., "Adult", "Student", "Member", "Fellow"
  description: text('description'),
  price: integer('price').notNull(), // Price in pence (smallest currency unit) to avoid floating point issues

  // SINGLE         — one admission to one performance (the normal case)
  // PASS_SALE      — the sale of a multi-performance pass (season, day,
  //                  festival, performer). Carries the money.
  // PASS_ADMISSION — an admission redeemed against a previously sold pass.
  //                  Carries zero money; still counts against capacity.
  //
  // Without this split, importing the legacy pass counters either double-counts
  // revenue or loses the fact a pass existed.
  kind: text('kind', {
    enum: ['SINGLE', 'PASS_SALE', 'PASS_ADMISSION'],
  }).notNull().default('SINGLE'),

  // Legacy-only types (Fringe 2021, StuFF passes) should not clutter the
  // box-office picker but must remain valid for historic tickets.
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),

  // Whether this ticket type is active/offered by default when added to a show or performance
  activeByDefault: integer('active_by_default', { mode: 'boolean' }).notNull().default(true),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('ticket_types_name_idx').on(table.name),
])

export const ticketTypesRelations = relations(ticketTypes, ({ many }) => ({
  showOverrides: many(showTicketTypeOverrides),
  performanceOverrides: many(performanceTicketTypeOverrides),
  tickets: many(tickets),
}))

// Show-level overrides — apply to all performances in a show unless further overridden
export const showTicketTypeOverrides = sqliteTable('show_ticket_type_overrides', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  ticketTypeId: text('ticket_type_id').notNull().references(() => ticketTypes.id, { onDelete: 'cascade' }),

  price: integer('price'), // Overrides ticketTypes.price when set
  active: integer('active', { mode: 'boolean' }), // Overrides ticketTypes.activeByDefault when set; null = use base default

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('show_ttp_overrides_show_id_idx').on(table.showId),
  index('show_ttp_overrides_ticket_type_id_idx').on(table.ticketTypeId),
  uniqueIndex('show_ttp_overrides_show_ticket_unique').on(table.showId, table.ticketTypeId),
])

export const showTicketTypeOverridesRelations = relations(showTicketTypeOverrides, ({ one }) => ({
  ticketType: one(ticketTypes, {
    fields: [showTicketTypeOverrides.ticketTypeId],
    references: [ticketTypes.id],
  }),
  show: one(shows, {
    fields: [showTicketTypeOverrides.showId],
    references: [shows.id],
  }),
}))

// Performance-level overrides — most specific, highest priority in the override chain
export const performanceTicketTypeOverrides = sqliteTable('performance_ticket_type_overrides', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'cascade' }),
  ticketTypeId: text('ticket_type_id').notNull().references(() => ticketTypes.id, { onDelete: 'cascade' }),

  price: integer('price'), // Overrides show/base price when set
  active: integer('active', { mode: 'boolean' }), // Overrides show/base active status when set; null = use higher-level default

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('perf_ttp_overrides_performance_id_idx').on(table.performanceId),
  index('perf_ttp_overrides_ticket_type_id_idx').on(table.ticketTypeId),
  uniqueIndex('perf_ttp_overrides_performance_ticket_unique').on(table.performanceId, table.ticketTypeId),
])

export const performanceTicketTypeOverridesRelations = relations(performanceTicketTypeOverrides, ({ one }) => ({
  ticketType: one(ticketTypes, {
    fields: [performanceTicketTypeOverrides.ticketTypeId],
    references: [ticketTypes.id],
  }),
  performance: one(performances, {
    fields: [performanceTicketTypeOverrides.performanceId],
    references: [performances.id],
  }),
}))

// An individual issued ticket, created when a customer books a seat.
// Belongs to a reservation and is tied to a specific performance and ticket type.
//
// Status is managed at the reservation level. The only per-ticket state is whether
// it has been individually refunded (e.g., a partial refund within a larger booking).
export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  reservationId: text('reservation_id').notNull().references(() => reservations.id, { onDelete: 'restrict' }),
  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'restrict' }),
  ticketTypeId: text('ticket_type_id').notNull().references(() => ticketTypes.id, { onDelete: 'restrict' }),

  // Snapshot of the price paid at time of booking; important since prices can be overridden and change over time
  pricePaid: integer('price_paid').notNull(),

  // EXACT   — the legacy sale had a single ticket category, so the unit price is
  //           price ÷ count with no inference (94.6% of legacy sales)
  // DERIVED — apportioned from a mixed-category sale using prices observed in
  //           single-category sales of the same show and era (5.4%)
  // UNKNOWN — a reservation never settled by a sale, so no price was ever
  //           recorded. Stored as 0.
  priceConfidence: text('price_confidence', {
    enum: ['EXACT', 'DERIVED', 'UNKNOWN'],
  }).notNull().default('EXACT'),

  // Set when this specific ticket is refunded independently of the reservation status
  refundedAt: integer('refunded_at', { mode: 'timestamp' }),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('tickets_reservation_id_idx').on(table.reservationId),
  index('tickets_performance_id_idx').on(table.performanceId),
  index('tickets_ticket_type_id_idx').on(table.ticketTypeId),

  // Covers the hot capacity count — COUNT(*) WHERE performance_id = ? AND
  // refunded_at IS NULL — which runs on every booking, walk-in and ticket edit,
  // and the per-reservation ticket counts on the box-office list.
  index('tickets_perf_refunded_idx').on(table.performanceId, table.refundedAt),
  index('tickets_res_refunded_idx').on(table.reservationId, table.refundedAt),
])

// Augments reservationsRelations with the tickets many-relation.
// Defined here (not in reservation.ts) to avoid a circular import,
// since ticket.ts already imports from reservation.ts.
export const reservationsTicketsRelation = relations(reservations, ({ many }) => ({
  tickets: many(tickets),
}))

export const ticketsRelations = relations(tickets, ({ one }) => ({
  reservation: one(reservations, {
    fields: [tickets.reservationId],
    references: [reservations.id],
  }),
  ticketType: one(ticketTypes, {
    fields: [tickets.ticketTypeId],
    references: [ticketTypes.id],
  }),
  performance: one(performances, {
    fields: [tickets.performanceId],
    references: [performances.id],
  }),
}))
