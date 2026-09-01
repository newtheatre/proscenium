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

// A term of rehearsals booked as one action (C-110). The recurrence is kept as the member
// described it, so a series can say what it is rather than being inferred from its occurrences.
export const roomSeries = sqliteTable('room_series', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  frequency: text('frequency').notNull(),
  // London weekdays as a sorted list, Sunday nought. Null for a daily series.
  weekdays: text('weekdays'),
  // Wall clocks and a London day, never instants: the arithmetic that expands them is the
  // recurrence, and storing instants would bake one DST offset into the whole term (0014).
  startsOn: text('starts_on').notNull(),
  clockFrom: text('clock_from').notNull(),
  clockTo: text('clock_to').notNull(),
  occurrences: integer('occurrences').notNull(),
  // The earliest occurrence still standing. Cancelling it promotes the next in the same batch,
  // so a series never splits (C-111 criterion 3).
  headBookingId: text('head_booking_id'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('room_series_user').on(table.userId),
  check('room_series_frequency', sql`${table.frequency} IN ('DAILY', 'WEEKLY')`),
  check('room_series_occurrences', sql`${table.occurrences} > 0`),
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
  // What the room is for, which is not the same question as who wins a contested slot. No CHECK
  // and no default: ROOM_PURPOSES is committee-editable, and history was never asked (C-119).
  purpose: text('purpose'),
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
  // Which series this belongs to, and where in it. Null on an ordinary booking, and every other
  // rule in the module treats an occurrence as one (C-110 criterion 5).
  seriesId: text('series_id').references(() => roomSeries.id),
  occurrence: integer('occurrence'),
  // The booking offered in place of one that was bumped. A bumped row is never deleted, so the
  // displaced member can see what happened and what they were given instead (C-115 criterion 4).
  bumpedToBookingId: text('bumped_to_booking_id'),
  bumpedReason: text('bumped_reason'),
  noShowRecordedAt: integer('no_show_recorded_at'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  // The clash predicate reads exactly this, on every booking attempt.
  index('room_bookings_clash').on(table.roomId, table.startsAt, table.endsAt),
  index('room_bookings_user').on(table.userId),
  // The sweep reads pending rows by age, and there are few of them beside the confirmed ones.
  index('room_bookings_status').on(table.status),
  // A series-scoped action reads every occurrence by this, never by an id list (0003, 0006).
  index('room_bookings_series').on(table.seriesId),
  check('room_bookings_span', sql`${table.endsAt} > ${table.startsAt}`),
  check(
    'room_bookings_status',
    sql`${table.status} IN ('CONFIRMED', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'BUMPED')`,
  ),
])

// A member's calendar subscription (C-104). Its own table rather than a column on users, so
// regenerating is a replace and the old URL dies by lookup rather than by comparison.
export const roomFeedTokens = sqliteTable('room_feed_tokens', {
  id: id(),
  // One live feed per person: regenerating replaces this row, which is what revokes the old URL.
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  // The URL carries the plaintext; the database holds its hash, so a leaked backup grants nothing.
  tokenHash: text('token_hash').notNull().unique(),
  lastFetchedAt: integer('last_fetched_at'),
  createdAt: integer('created_at').notNull().default(now),
})

// A room shut for maintenance, a get-in or an external hire (C-114). The old app had no way to
// say a room was closed, so people booked into a get-in and found out on the night.
export const roomBlackouts = sqliteTable('room_blackouts', {
  id: id(),
  // Null is every room, which is what a fire alarm test or a building closure means.
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
  // Shown to everybody on the calendar, never masked: a closed room explains itself (criterion 4).
  reason: text('reason').notNull(),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('room_blackouts_span').on(table.startsAt, table.endsAt),
  index('room_blackouts_room').on(table.roomId),
  check('room_blackouts_span', sql`${table.endsAt} > ${table.startsAt}`),
])

// Bookings nobody turned up for (C-116). Append-only: a correction is a superseding entry with a
// reason, never an edit, so the count can always be reconstructed (0010).
export const roomNoShows = sqliteTable('room_no_shows', {
  id: id(),
  bookingId: text('booking_id').notNull().references(() => roomBookings.id, { onDelete: 'restrict' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  // RECORDED asserts one; WITHDRAWN supersedes an earlier assertion about the same booking.
  kind: text('kind').notNull().default('RECORDED'),
  // Why it was withdrawn. Never personal free text, the same rule audit detail follows (0011).
  reason: text('reason'),
  supersedesId: text('supersedes_id'),
  recordedBy: text('recorded_by').references(() => users.id),
  recordedAt: integer('recorded_at').notNull().default(now),
}, table => [
  index('room_no_shows_user').on(table.userId),
  index('room_no_shows_booking').on(table.bookingId),
  check('room_no_shows_kind', sql`${table.kind} IN ('RECORDED', 'WITHDRAWN')`),
])

// Rooms somebody else manages (C-119). A reference catalogue, never a bookable estate: we
// cannot promise a room we do not control, so nothing here holds a slot or appears on a calendar.
export const externalSpaces = sqliteTable('external_spaces', {
  id: id(),
  name: text('name').notNull(),
  campus: text('campus'),
  building: text('building'),
  // Whoever gets the room booked, which for an SU room is a desk rather than a person.
  contact: text('contact'),
  capacity: integer('capacity'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  unique('external_spaces_name').on(table.name),
  index('external_spaces_active').on(table.isActive),
  check('external_spaces_capacity', sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
])

// What we learned about a space, the hard way. A meeting room with a fixed table is no good for a
// rehearsal, and nobody knew until they turned up to it (C-119).
export const externalSpaceNotes = sqliteTable('external_space_notes', {
  id: id(),
  spaceId: text('space_id').notNull().references(() => externalSpaces.id, { onDelete: 'cascade' }),
  // No CHECK: ROOM_PURPOSES is committee-editable, and a constraint behind an editable list breaks
  // writes the moment the list is used (0033's reasoning).
  purpose: text('purpose').notNull(),
  verdict: text('verdict').notNull(),
  reason: text('reason').notNull(),
  writtenBy: text('written_by').references(() => users.id),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  // One verdict per space per purpose: two would leave nobody knowing which applied.
  unique('external_space_notes_space_purpose').on(table.spaceId, table.purpose),
  index('external_space_notes_space').on(table.spaceId),
  check('external_space_notes_verdict', sql`${table.verdict} IN ('SUITABLE', 'CAUTION', 'UNSUITABLE')`),
])

// A member's ask for a room we do not manage (C-120). Not a booking: it holds no slot, because
// the SU may assign anything and two members asking for the same evening must both be possible.
export const externalRequests = sqliteTable('external_requests', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  purpose: text('purpose').notNull(),
  attendees: integer('attendees'),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at').notNull(),
  // What the member would like, and what we were actually given. Rarely the same thing.
  preferredSpaceId: text('preferred_space_id').references(() => externalSpaces.id),
  assignedSpaceId: text('assigned_space_id').references(() => externalSpaces.id),
  notes: text('notes'),
  // Whatever the SU calls the booking on their side, so the two can be reconciled by hand.
  suReference: text('su_reference'),
  status: text('status').notNull().default('REQUESTED'),
  submittedAt: integer('submitted_at'),
  submittedBy: text('submitted_by').references(() => users.id),
  decidedAt: integer('decided_at'),
  decidedBy: text('decided_by').references(() => users.id),
  rejectionReason: text('rejection_reason'),
  escalatedAt: integer('escalated_at'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('external_requests_status').on(table.status),
  index('external_requests_user').on(table.userId),
  check('external_requests_span', sql`${table.endsAt} > ${table.startsAt}`),
  // A closed set about process, unlike a purpose, so a CHECK is right here (0033's distinction).
  check(
    'external_requests_status',
    sql`${table.status} IN ('REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED', 'REJECTED', 'CANCELLED')`,
  ),
])

// What we asked for against what we were given, every time. Without this, asking again
// overwrites the answer and nobody can see that the first room was no good (C-120).
export const externalAssignments = sqliteTable('external_assignments', {
  id: id(),
  requestId: text('request_id').notNull().references(() => externalRequests.id, { onDelete: 'cascade' }),
  spaceId: text('space_id').notNull().references(() => externalSpaces.id, { onDelete: 'restrict' }),
  outcome: text('outcome').notNull(),
  reason: text('reason'),
  recordedBy: text('recorded_by').references(() => users.id),
  recordedAt: integer('recorded_at').notNull().default(now),
}, table => [
  index('external_assignments_request').on(table.requestId),
  check('external_assignments_outcome', sql`${table.outcome} IN ('ACCEPTED', 'REFUSED')`),
])
