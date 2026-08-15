import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid, customAlphabet } from 'nanoid'
import { performances } from './show'
import { users } from './user'

// Unambiguous uppercase alphanumeric alphabet (removes O/0, I/L/1)
const bookingRefId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

/**
 * A customer's booking for a performance. Every one belongs to a user account;
 * status lifecycle: docs/03-domain-model.md#reservations
 */
export const reservations = sqliteTable('reservations', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // Short human-readable public code used for QR codes and confirmation emails
  // e.g. "A3KP7X" — uses an unambiguous character set to avoid misreads
  bookingRef: text('booking_ref').notNull().$defaultFn(() => bookingRefId()),

  // The legacy public handle. Every confirmation email since 2016 carried a
  // `/cancel/<code>/` link, so keeping it lets those URLs be redirected.
  legacyRef: text('legacy_ref'),

  // How the booking reached us. LEGACY_IMPORT marks rows whose provenance is
  // the Heroku system rather than this application.
  source: text('source', {
    enum: ['WEB', 'BOX_OFFICE', 'DOOR', 'LEGACY_IMPORT'],
  }).notNull().default('WEB'),

  // Legacy overwrote `quantity` with the collected count, so its meaning changes
  // at collection. Proscenium models tickets as rows, so this has nowhere else to live.
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

  // Every list sorts by createdAt DESC, so without an index SQLite sorts the
  // whole table before returning a page.
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
