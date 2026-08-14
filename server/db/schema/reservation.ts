import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid, customAlphabet } from 'nanoid'
import { performances } from './show'
import { users } from './user'

// Unambiguous uppercase alphanumeric alphabet (removes O/0, I/L/1)
const bookingRefId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

/**
 * A customer's booking for one or more tickets to a performance.
 *
 * Every reservation belongs to a user account; customers without one get a
 * shadow account from the auth service, so ownership is consistent and can be
 * claimed later.
 *
 * Status lifecycle:
 *   PENDING   — booked, awaiting collection and payment at the box office
 *   COLLECTED — tickets collected and paid for in person
 *   DOOR      — bought on the door, not pre-booked
 *   CANCELLED — cancelled by the customer or staff; see cancelledBy
 *   NO_SHOW   — held but never collected
 *
 * Status is per reservation. Individual tickets refund independently via
 * `refundedAt` (ADR-0011).
 */
export const reservations = sqliteTable('reservations', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // Short human-readable public code used for QR codes and confirmation emails
  // e.g. "A3KP7X" — uses an unambiguous character set to avoid misreads
  bookingRef: text('booking_ref').notNull().$defaultFn(() => bookingRefId()),

  // The legacy 16-hex code — the reservation's public handle before the import.
  // Every confirmation email since 2016 carried a `/cancel/<code>/` link, so
  // keeping it lets those URLs be redirected rather than 404.
  legacyRef: text('legacy_ref'),

  // How the booking reached us. LEGACY_IMPORT marks rows whose provenance is
  // the Heroku system rather than this application.
  source: text('source', {
    enum: ['WEB', 'BOX_OFFICE', 'DOOR', 'LEGACY_IMPORT'],
  }).notNull().default('WEB'),

  // How many seats were originally booked.
  //
  // Legacy overwrote `quantity` with the collected count on collection, so a
  // legacy row's `quantity` means "booked" before collection and "collected"
  // after. Proscenium models tickets as rows, so the original figure has nowhere
  // else to live.
  originalQuantity: integer('original_quantity'),

  // Set when the owning user was anonymised under the retention policy.
  anonymisedAt: text('anonymised_at'),

  performanceId: text('performance_id').notNull().references(() => performances.id, { onDelete: 'restrict' }),

  // Always references a user — guests get a shadow account with no password.
  // onDelete: restrict prevents accidental data loss; reassign before deleting a user.
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),

  status: text('status', {
    enum: ['PENDING', 'COLLECTED', 'DOOR', 'CANCELLED', 'NO_SHOW'],
  }).notNull().default('PENDING'),

  // Distinguishes who initiated a CANCELLED reservation
  cancelledBy: text('cancelled_by', { enum: ['CUSTOMER', 'STAFF'] }),

  // Freetext requests submitted by the customer at booking time (accessibility needs, dietary requirements, etc.)
  customerNotes: text('customer_notes'),

  // Internal box-office notes — not visible to the customer
  staffNotes: text('staff_notes'),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('reservations_booking_ref_unique').on(table.bookingRef),
  // SQLite treats NULLs as distinct, so this only constrains imported rows.
  uniqueIndex('reservations_legacy_ref_unique').on(table.legacyRef),
  index('reservations_performance_id_idx').on(table.performanceId),
  index('reservations_user_id_idx').on(table.userId),
  index('reservations_status_idx').on(table.status),

  // Every reservation list sorts by createdAt DESC, so without an index SQLite
  // reads and sorts the whole table before returning a page — paginating alone
  // does not reduce the work. The composites let one index satisfy both the
  // filter and the ordering.
  index('reservations_created_at_idx').on(table.createdAt),
  index('reservations_status_created_idx').on(table.status, table.createdAt),
  index('reservations_perf_created_idx').on(table.performanceId, table.createdAt),
  index('reservations_user_created_idx').on(table.userId, table.createdAt),
])

export const reservationsRelations = relations(reservations, ({ one }) => ({
  performance: one(performances, {
    fields: [reservations.performanceId],
    references: [performances.id],
  }),
  user: one(users, {
    fields: [reservations.userId],
    references: [users.id],
  }),
  // tickets: many(tickets) — defined in ticket.ts via reservationsTicketsRelation to avoid circular imports
}))
