import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid, customAlphabet } from 'nanoid'
import { performances } from './show'
import { users } from './user'

// Unambiguous uppercase alphanumeric alphabet (removes O/0, I/L/1)
const bookingRefId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

/**
 * A reservation is a customer's booking for one or more tickets to a specific performance.
 *
 * Every reservation belongs to a user account. Customers without accounts are given a
 * shadow account (no password set) so that all reservations have consistent ownership
 * and can be upgraded to a full account later.
 *
 * Status lifecycle:
 *   PENDING    — reservation made, awaiting collection / payment at the box office
 *   COLLECTED  — tickets collected and payment received in-person
 *   DOOR       — purchased on the door (walk-up, not pre-booked)
 *   CANCELLED  — cancelled by the customer or by staff; see cancelledBy for who
 *   NO_SHOW    — reservation held but customer did not collect or attend
 *
 * Status is tracked at the reservation level only. Individual tickets can be
 * independently refunded via their refundedAt field.
 */
export const reservations = sqliteTable('reservations', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),

  // Short human-readable public code used for QR codes and confirmation emails
  // e.g. "A3KP7X" — uses an unambiguous character set to avoid misreads
  bookingRef: text('booking_ref').notNull().$defaultFn(() => bookingRefId()),

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
  index('reservations_performance_id_idx').on(table.performanceId),
  index('reservations_user_id_idx').on(table.userId),
  index('reservations_status_idx').on(table.status),
])

export const reservationsRelations = relations(reservations, ({ one, many }) => ({
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
