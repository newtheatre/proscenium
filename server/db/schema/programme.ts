import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { rooms } from './rooms'
import { users } from './identity'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// The programme: where we perform, what we perform, and when. Shared by ticketing (module D) and
// show night (module E); everything record-like keys to a performance, never a day or a venue.

// A venue is its own row, never a flagged room (0043). `room_id` is a pointer with one effect:
// the venue's performances apply blackouts to that room.
export const venues = sqliteTable('venues', {
  id: id(),
  name: text('name').notNull(),
  address: text('address'),
  // Null is uncapped. General admission only; no seat map exists and nothing may assume one.
  capacity: integer('capacity'),
  isExternal: integer('is_external', { mode: 'boolean' }).notNull().default(false),
  imageKey: text('image_key'),
  description: text('description'),
  roomId: text('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  unique('venues_name').on(table.name),
  index('venues_room').on(table.roomId),
  check('venues_capacity_positive', sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
])

// The card front of house reads in the dark (E-113). Every column describes the building, so
// none of it is personal data whoever last edited it.
export const venueEmergencyInfo = sqliteTable('venue_emergency_info', {
  venueId: text('venue_id').primaryKey().references(() => venues.id, { onDelete: 'cascade' }),
  assemblyPoint: text('assembly_point'),
  exits: text('exits'),
  isolationPoints: text('isolation_points'),
  what3words: text('what3words'),
  notes: text('notes'),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
})

// The financial season runs 1 August to 31 July, which is the committee year.
export const seasons = sqliteTable('seasons', {
  id: id(),
  name: text('name').notNull(),
  startsOn: text('starts_on').notNull(),
  endsOn: text('ends_on').notNull(),
  sort: integer('sort').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
}, table => [
  unique('seasons_name').on(table.name),
  check('seasons_order', sql`${table.endsOn} > ${table.startsOn}`),
])

export const showCategories = sqliteTable('show_categories', {
  id: id(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
}, table => [
  unique('show_categories_name').on(table.name),
])

export const shows = sqliteTable('shows', {
  id: id(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  description: text('description'),
  longDescription: text('long_description'),
  posterKey: text('poster_key'),
  categoryId: text('category_id').references(() => showCategories.id, { onDelete: 'restrict' }),
  seasonId: text('season_id').references(() => seasons.id, { onDelete: 'set null' }),
  ageGuidance: text('age_guidance'),
  latecomerPolicy: text('latecomer_policy'),
  // Distinct from having no warning rows: nobody having looked is not the same as nothing to say.
  warningsConfirmedNone: integer('warnings_confirmed_none', { mode: 'boolean' }).notNull().default(false),
  contentNotes: text('content_notes'),
  status: text('status').notNull().default('DRAFT'),
  // Reserved and unreferenced, so module B attaches here without rebuilding the table.
  productionId: text('production_id'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  unique('shows_slug').on(table.slug),
  index('shows_status').on(table.status),
  index('shows_season').on(table.seasonId),
  check('shows_status_values', sql`${table.status} IN ('DRAFT', 'PUBLISHED')`),
  check('shows_latecomer_policy_values', sql`${table.latecomerPolicy} IS NULL OR ${table.latecomerPolicy} IN ('ADMITTED', 'AT_INTERVAL', 'NOT_ADMITTED')`),
])

export const contentWarnings = sqliteTable('content_warnings', {
  id: id(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  category: text('category'),
  description: text('description'),
  icon: text('icon'),
  sort: integer('sort').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
}, table => [
  unique('content_warnings_slug').on(table.slug),
  unique('content_warnings_title').on(table.title),
  check('content_warnings_kind_values', sql`${table.kind} IN ('TECHNICAL', 'GENERAL')`),
])

// A level is null exactly when the warning is TECHNICAL. SQLite cannot check across tables, so
// the values are held here and the correlation at D-102's write path (docs/data-model.md).
export const showContentWarnings = sqliteTable('show_content_warnings', {
  id: id(),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  warningId: text('warning_id').notNull().references(() => contentWarnings.id, { onDelete: 'restrict' }),
  level: text('level'),
}, table => [
  unique('show_content_warnings_pair').on(table.showId, table.warningId),
  check('show_content_warnings_level_values', sql`${table.level} IS NULL OR ${table.level} IN ('MENTIONED', 'DISCUSSED', 'DEPICTED')`),
])

export const performances = sqliteTable('performances', {
  id: id(),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' }),
  startsAt: integer('starts_at').notNull(),
  doorsAt: integer('doors_at'),
  durationMinutes: integer('duration_minutes'),
  intervalCount: integer('interval_count').notNull().default(0),
  intervalMinutes: integer('interval_minutes'),
  // Null takes the venue's capacity; an explicit nought is a closed house, not an absence.
  capacityOverride: integer('capacity_override'),
  // Null and nought both mean curtain-up (D-112).
  bookingClosesHoursBefore: integer('booking_closes_hours_before'),
  holdReleaseMinutesBefore: integer('hold_release_minutes_before'),
  externalBookingUrl: text('external_booking_url'),
  status: text('status').notNull().default('DRAFT'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  // The night is a window over `starts_at` across the whole estate, narrowed by venue only when
  // asked, so both indexes are read by `performancesOnNight()`.
  index('performances_starts_at').on(table.startsAt),
  index('performances_venue_starts_at').on(table.venueId, table.startsAt),
  index('performances_show').on(table.showId),
  check('performances_status_values', sql`${table.status} IN ('DRAFT', 'ON_SALE', 'CANCELLED')`),
  check('performances_capacity_override', sql`${table.capacityOverride} IS NULL OR ${table.capacityOverride} >= 0`),
  check('performances_interval_count', sql`${table.intervalCount} >= 0`),
])
