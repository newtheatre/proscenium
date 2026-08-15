/**
 * A curated vocabulary and the shows that carry each entry. TECHNICAL has no
 * level; GENERAL has one of three (ADR-0004).
 */
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { shows } from './show'

/*
 * ── The vocabulary ────────────────────────────────────────────────────────
 */

/**
 * `slug` is the stable key — migrations and seeds reference a warning by slug,
 * never by id. `category` is plain text so it needs no deploy; null if TECHNICAL.
 */
export const contentWarnings = sqliteTable('content_warnings', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['TECHNICAL', 'GENERAL'] }).notNull(),
  category: text('category'),
  /** One line of clarification, shown as help in the editor and on the show page. */
  description: text('description'),
  /** An icon name. Constrained to a shortlist in the admin form — see CONTENT_WARNING_ICONS. */
  icon: text('icon'),
  sort: integer('sort').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().$onUpdate(() => sql`(current_timestamp)`),
}, table => [
  uniqueIndex('content_warnings_slug_unique').on(table.slug),
  uniqueIndex('content_warnings_title_unique').on(table.title),
  // Drizzle's `enum` option is a TypeScript union and emits no SQL, so without
  // this the column would accept any string forever.
  check('content_warnings_kind_domain', sql`"kind" IN ('TECHNICAL', 'GENERAL')`),
])

/*
 * ── The links ─────────────────────────────────────────────────────────────
 */

/**
 * `level` is null exactly when the warning is TECHNICAL; SQLite CHECK cannot
 * see the other row, so PUT /api/shows/:id enforces that half. `restrict` per ADR-0010.
 */
export const showContentWarnings = sqliteTable('show_content_warnings', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  contentWarningId: text('content_warning_id').notNull().references(() => contentWarnings.id, { onDelete: 'restrict' }),
  level: text('level', { enum: ['MENTIONED', 'DISCUSSED', 'DEPICTED'] }),

  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
}, table => [
  index('show_content_warnings_show_id_idx').on(table.showId),
  index('show_content_warnings_warning_id_idx').on(table.contentWarningId),
  // One level per warning per show. The old index included the axis, which is
  // what let the same warning appear on a show twice.
  uniqueIndex('show_content_warnings_unique').on(table.showId, table.contentWarningId),
  check('show_content_warnings_level_domain', sql`"level" IS NULL OR "level" IN ('MENTIONED', 'DISCUSSED', 'DEPICTED')`),
])

export const contentWarningsRelations = relations(contentWarnings, ({ many }) => ({
  shows: many(showContentWarnings),
}))

export const showContentWarningsRelations = relations(showContentWarnings, ({ one }) => ({
  show: one(shows, { fields: [showContentWarnings.showId], references: [shows.id] }),
  contentWarning: one(contentWarnings, { fields: [showContentWarnings.contentWarningId], references: [contentWarnings.id] }),
}))

/*
 * ── Archive ───────────────────────────────────────────────────────────────
 */

/**
 * The pre-rework rows, verbatim. Declared here so they appear in the Drizzle
 * snapshot; never written by the application (ADR-0004).
 */
export const contentWarningsArchive = sqliteTable('content_warnings_archive', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  icon: text('icon'),
  legacyCategory: text('legacy_category'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
})

export const showContentWarningsArchive = sqliteTable('show_content_warnings_archive', {
  id: text('id').primaryKey(),
  showId: text('show_id').notNull(),
  contentWarningId: text('content_warning_id').notNull(),
  /** The axis the link sat on: ACTION, DIALOGUE or TECHNICAL. */
  kind: text('kind').notNull(),
  /**
   * What this archive row was remapped onto, or null. The remap collapses rows,
   * so a missing id does not mean it was dropped (ADR-0004).
   */
  mappedToWarningId: text('mapped_to_warning_id'),
  createdAt: text('created_at'),
}, table => [
  index('show_content_warnings_archive_show_id_idx').on(table.showId),
])
