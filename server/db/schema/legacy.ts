/**
 * Tables required to import the legacy database without loss (ADR-0003): live
 * model extensions, plus a verbatim archive layer.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { shows } from './show'
import { venues } from './venue'

/*
 * ── 1. Live model extensions ──────────────────────────────────────────────
 */

/**
 * The strand a show belongs to. In House, Fringe, StuFF, External, Studio.
 * Orthogonal to season: category is what kind of show, season is when.
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

// Content warnings moved to their own file; the kind/level model is not the
// legacy one (ADR-0004).

/**
 * Alternative spellings a venue has been known by. Legacy stored venue as free
 * text, so the aliases are what make the archive searchable.
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

/*
 * ── 2. Archive layer ──────────────────────────────────────────────────────
 */

/**
 * Every legacy row verbatim, as JSON, so a mapping decision can be re-derived.
 * Credentials are redacted on write; never written by the application.
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
 * (legacy row) → (Proscenium row), which makes the import reversible.
 * `confidence` values: docs/decisions/0003-legacy-ticketing-import.md
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
