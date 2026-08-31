import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// The bookable estate (C-101). A room is deactivated, never deleted, so a booking made two years
// ago still names something.

export const rooms = sqliteTable('rooms', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  // Null is uncapped, and is compared against a booking's attendees as a warning, not a refusal.
  capacity: integer('capacity'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // Books through the approval queue whatever the policy says (C-105 criterion 5).
  sensitive: integer('sensitive', { mode: 'boolean' }).notNull().default(false),
  // Somebody else's room, arranged by conversation. "External" rather than "venue": a venue is
  // where a performance happens, and the auditorium is both (C-101).
  isExternal: integer('is_external', { mode: 'boolean' }).notNull().default(false),
  campus: text('campus'),
  building: text('building'),
  contact: text('contact'),
  // Null falls back to the estate setting. Nought is an override meaning none needed, which is why
  // the resolution tests absence rather than falsiness (C-106 criterion 1).
  minBookingMinutes: integer('min_booking_minutes'),
  maxBookingHours: integer('max_booking_hours'),
  noticeHours: integer('notice_hours'),
  horizonWeeks: integer('horizon_weeks'),
  activeBookingsCap: integer('active_bookings_cap'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  // Member-facing calendars list the active rooms and nothing else (criterion 4).
  index('rooms_is_active').on(table.isActive),
  index('rooms_is_external').on(table.isExternal),
  unique('rooms_name').on(table.name),
  check('rooms_capacity_positive', sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
])

export const roomHours = sqliteTable('room_hours', {
  id: id(),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),
  // HH:MM, zero-padded, so they compare and sort as strings and no timezone is involved.
  opens: text('opens').notNull(),
  closes: text('closes').notNull(),
}, table => [
  index('room_hours_room').on(table.roomId),
  check('room_hours_weekday', sql`${table.weekday} BETWEEN 0 AND 6`),
  check('room_hours_order', sql`${table.closes} > ${table.opens}`),
])

export const roomBookings = sqliteTable('room_bookings', {
  id: id(),
  // Restrict, not cascade: a room is retired rather than deleted, so a booking losing its room
  // would be a bug rather than a case to handle.
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'restrict' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  attendees: integer('attendees'),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at').notNull(),
  // No CHECK: ROOM_PRIORITY_TIERS is committee-editable and a constraint behind an editable list
  // breaks writes the moment the list is used (0033's reasoning, C-115).
  tier: text('tier').notNull().default('GENERAL'),
  status: text('status').notNull().default('CONFIRMED'),
  notes: text('notes'),
  // Why the member is asking for something outside policy. Required on a request (C-108).
  reason: text('reason'),
  // When the approvers were told this had been waiting, so a nightly sweep tells them once.
  escalatedAt: integer('escalated_at'),
  rejectionReason: text('rejection_reason'),
  // Who answered the request, and when. No delete action: SQLite cannot add one to an existing
  // table, and erasure anonymises rather than deletes, so no row loses its officer (0011).
  decidedBy: text('decided_by').references(() => users.id),
  decidedAt: integer('decided_at'),
  noShowRecordedAt: integer('no_show_recorded_at'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  // The clash predicate reads exactly this, on every booking attempt.
  index('room_bookings_clash').on(table.roomId, table.startsAt, table.endsAt),
  index('room_bookings_user').on(table.userId),
  // The sweep reads pending rows by age, and there are few of them beside the confirmed ones.
  index('room_bookings_status').on(table.status),
  check('room_bookings_span', sql`${table.endsAt} > ${table.startsAt}`),
  check(
    'room_bookings_status',
    sql`${table.status} IN ('CONFIRMED', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'BUMPED')`,
  ),
])
