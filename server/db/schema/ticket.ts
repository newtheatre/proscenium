import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Base ticket type definitions shared across all shows/performances
export const ticketTypes = sqliteTable('ticket_types', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(), // e.g., "Adult", "Student", "Member", "Fellow"
  description: text('description'),
  price: integer('price').notNull(), // Price in pence (smallest currency unit) to avoid floating point issues

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
  showId: text('show_id').notNull(), // FK to shows.id — will be constrained once show schema is defined
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
  // show: one(shows, { ... }) — will be added in show schema
}))

// Performance-level overrides — most specific, highest priority in the override chain
export const performanceTicketTypeOverrides = sqliteTable('performance_ticket_type_overrides', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  performanceId: text('performance_id').notNull(), // FK to performances.id — will be constrained once performance schema is defined
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
  // performance: one(performances, { ... }) — will be added in performance schema
}))

// An individual issued ticket, created when a customer books a seat.
// Belongs to a reservation and is tied to a specific performance and ticket type.
export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  reservationId: text('reservation_id').notNull(), // FK to reservations.id — will be constrained once reservation schema is defined
  performanceId: text('performance_id').notNull(), // FK to performances.id — will be constrained once performance schema is defined
  ticketTypeId: text('ticket_type_id').notNull().references(() => ticketTypes.id, { onDelete: 'restrict' }),

  // Snapshot of the price paid at time of booking; important since prices can be overridden and change over time
  pricePaid: integer('price_paid').notNull(),

  status: text('status', { enum: ['PENDING', 'COLLECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_ADMIN', 'NO_SHOW', 'REFUNDED'] }).notNull().default('PENDING'),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('tickets_reservation_id_idx').on(table.reservationId),
  index('tickets_performance_id_idx').on(table.performanceId),
  index('tickets_ticket_type_id_idx').on(table.ticketTypeId),
  index('tickets_status_idx').on(table.status),
])

export const ticketsRelations = relations(tickets, ({ one }) => ({
  ticketType: one(ticketTypes, {
    fields: [tickets.ticketTypeId],
    references: [ticketTypes.id],
  }),
  // reservation: one(reservations, { ... }) — will be added in reservation schema
  // performance: one(performances, { ... }) — will be added in performance schema
}))
