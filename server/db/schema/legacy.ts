/**
 * Tables required to import the legacy Heroku/Django ticketing database
 * without loss. Split into two groups:
 *
 *   1. Live model extensions — show categories and venue aliases. These are
 *      real features the box office and website should use, not import
 *      scaffolding. (Content warnings started here too; they now have their own
 *      file, server/db/schema/contentWarnings.ts.)
 *   2. Archive layer — legacyRecords / legacyIdMap. Verbatim insurance that
 *      makes every mapping decision reversible.
 *
 * Column additions to the existing tables live alongside those tables.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { shows } from './show'
import { venues } from './venue'

/* ------------------------------------------------------------------ *
 * 1. Live model extensions
 * ------------------------------------------------------------------ */

/**
 * The strand a show belongs to — In House, Fringe, StuFF, External, Studio.
 * Legacy source: tickets_category (7 rows).
 *
 * Orthogonal to a season: category is *what kind of show*, season is *when*.
 */
export const showCategories = sqliteTable('show_categories', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  sort: integer('sort').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('show_categories_slug_unique').on(table.slug),
])

export const showCategoriesRelations = relations(showCategories, ({ many }) => ({
  shows: many(shows),
}))

// Content warnings used to live here. They outgrew "import scaffolding" — the
// axis model came from legacy but the current kind/level model does not — so
// they now have their own file: server/db/schema/contentWarnings.ts.

/**
 * Alternative spellings a venue has been known by. Legacy stored venue as free
 * text on the show — 38 distinct strings for about eight real rooms. Keeping
 * the aliases means "what did the 2019 programme call this room?" stays
 * answerable, and future imports can resolve the same strings automatically.
 */
export const venueAliases = sqliteTable('venue_aliases', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  venueId: text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  source: text('source'), // e.g. 'legacy-ticketing'

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('venue_aliases_venue_id_idx').on(table.venueId),
  uniqueIndex('venue_aliases_alias_unique').on(table.alias),
])

export const venueAliasesRelations = relations(venueAliases, ({ one }) => ({
  venue: one(venues, { fields: [venueAliases.venueId], references: [venues.id] }),
}))

/* ------------------------------------------------------------------ *
 * 2. Archive layer
 * ------------------------------------------------------------------ */

/**
 * Every row of the legacy database, verbatim, as JSON.
 *
 * This is the insurance policy. If a mapping decision in the import later turns
 * out to be wrong, the original is still here and the import can be re-derived
 * without going back to a pg_dump on someone's laptop. That matters because
 * 12,251 of 13,025 named legacy sales are matched to a reservation by fuzzy
 * name rather than a foreign key.
 *
 * Excludes django_session (expired sessions, no value) and any column carrying
 * a credential (auth_user.password is redacted on write).
 *
 * ~48,000 rows. Never written by the application — import only.
 */
export const legacyRecords = sqliteTable('legacy_records', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  sourceSystem: text('source_system').notNull().default('ticketing-heroku'),
  sourceTable: text('source_table').notNull(),
  sourceId: text('source_id').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  /** Set when personal fields in payload were redacted before storage. */
  redactedAt: text('redacted_at'),

  importedAt: text('imported_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('legacy_records_source_table_idx').on(table.sourceTable),
  uniqueIndex('legacy_records_source_unique').on(table.sourceSystem, table.sourceTable, table.sourceId),
])

/**
 * (legacy row) → (Proscenium row). Answers "what did legacy ticket 14322
 * become?" and makes the import re-runnable and reversible.
 *
 * `confidence` records how the link was established:
 *   DIRECT    — deterministic mapping from a legacy primary key
 *   MATCHED   — inferred, e.g. sale.ticket free-text matched to a reservation
 *   SYNTHETIC — target row invented to satisfy a NOT NULL constraint
 */
export const legacyIdMap = sqliteTable('legacy_id_map', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  sourceSystem: text('source_system').notNull().default('ticketing-heroku'),
  sourceTable: text('source_table').notNull(),
  sourceId: text('source_id').notNull(),
  targetTable: text('target_table').notNull(),
  targetId: text('target_id').notNull(),
  confidence: text('confidence', { enum: ['DIRECT', 'MATCHED', 'SYNTHETIC'] }).notNull().default('DIRECT'),
  note: text('note'),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('legacy_id_map_target_idx').on(table.targetTable, table.targetId),
  uniqueIndex('legacy_id_map_source_unique').on(table.sourceSystem, table.sourceTable, table.sourceId, table.targetTable),
])
