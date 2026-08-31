import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

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
