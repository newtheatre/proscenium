import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { venues } from './venue'
import { showCategories } from './legacy'
import { seasons } from './passes'

// A show is a production — the top-level entity for a run of performances.
export const shows = sqliteTable('shows', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  slug: text('slug').notNull().unique(), // URL-friendly identifier, e.g. "machinal-2026"
  title: text('title').notNull(),
  subtitle: text('subtitle'), // Optional secondary title or tagline
  description: text('description'),
  // The legacy site carried two descriptions: a short one for cards and a long
  // one for the show page. 403 of 477 legacy shows used both.
  longDescription: text('long_description'),
  posterUrl: text('poster_url'), // Reference to NuxtHub blob storage (Cloudflare R2)
  // Link to the digital programme. 13 legacy shows have one.
  programmeUrl: text('programme_url'),
  // External booking or info link for shows we host but do not sell for.
  externalUrl: text('external_url'),

  // The strand this show belongs to — In House, Fringe, StuFF, External, …
  categoryId: text('category_id').references(() => showCategories.id, { onDelete: 'restrict' }),

  // The programming period this show sits in — "Autumn 2026". Orthogonal to
  // category: category is what kind of show, season is when. Nullable, because
  // externals and one-offs do not belong to one.
  seasonId: text('season_id').references(() => seasons.id, { onDelete: 'set null' }),

  // Free-text notes accompanying the content warnings.
  contentWarningNotes: text('content_warning_notes'),
  // TRUE means "checked, there are none" — meaningfully different from the
  // absence of any showContentWarnings rows, which means "nobody filled it in".
  warningsConfirmedNone: integer('warnings_confirmed_none', { mode: 'boolean' }).notNull().default(false),

  status: text('status', {
    enum: ['DRAFT', 'PUBLISHED'],
  }).notNull().default('DRAFT'),

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('shows_title_idx').on(table.title),
  index('shows_status_idx').on(table.status),
  index('shows_category_id_idx').on(table.categoryId),
  index('shows_season_id_idx').on(table.seasonId),
  uniqueIndex('shows_slug_unique').on(table.slug),
])

export const showsRelations = relations(shows, ({ one, many }) => ({
  performances: many(performances),
  category: one(showCategories, {
    fields: [shows.categoryId],
    references: [showCategories.id],
  }),
  // contentWarnings is defined in legacy.ts (showContentWarningsRelations)
  // ticketTypeOverrides and tickets relations are defined in ticket.ts to avoid circular imports
}))

// A performance is a specific scheduled instance of a show at a venue on a given date/time.
export const performances = sqliteTable('performances', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' }),

  // Date/time stored as unix timestamps for reliable sorting and comparison
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  doorsAt: integer('doors_at', { mode: 'timestamp' }), // Optional — when doors open to the public

  durationMinutes: integer('duration_minutes'), // Approximate run time in minutes (excluding interval)
  intervalCount: integer('interval_count').notNull().default(0), // Number of intervals (0, 1, 2, ...)
  intervalMinutes: integer('interval_minutes'), // Duration of each interval in minutes

  // Overrides venue.capacity for this specific performance; null = use venue default
  capacityOverride: integer('capacity_override'),

  // Booking closes this many hours before startsAt. Legacy `hours_til_close`:
  // 789 performances used 2, 440 used 1, 25 used 0.
  bookingClosesHoursBefore: integer('booking_closes_hours_before'),

  // SOLD_OUT is calculated from ticket counts vs. effective capacity.
  // COMPLETED is inferred from startsAt < now AND status != CANCELLED.
  status: text('status', {
    enum: ['DRAFT', 'ON_SALE', 'CANCELLED'],
  }).notNull().default('DRAFT'),

  notes: text('notes'), // Internal production notes, not shown to customers

  // Metadata
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  index('performances_show_id_idx').on(table.showId),
  index('performances_venue_id_idx').on(table.venueId),
  index('performances_starts_at_idx').on(table.startsAt),
  index('performances_status_idx').on(table.status),
])

export const performancesRelations = relations(performances, ({ one }) => ({
  show: one(shows, {
    fields: [performances.showId],
    references: [shows.id],
  }),
  venue: one(venues, {
    fields: [performances.venueId],
    references: [venues.id],
  }),
  // ticketTypeOverrides and tickets relations are defined in ticket.ts to avoid circular imports
}))
