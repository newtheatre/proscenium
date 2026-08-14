/**
 * Content warnings: a curated vocabulary, and the shows that carry each entry.
 * The schema mirrors how the theatre splits them (ADR-0004):
 *
 * TECHNICAL — a closed set of production effects (strobe, loud noise, haze).
 *             Either the show does it or it does not, so the link carries no
 *             level.
 * GENERAL   — a theme, at one of MENTIONED / DISCUSSED / DEPICTED. One level
 *             per warning per show.
 *
 * The archive tables at the bottom hold the pre-rework rows verbatim.
 */
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { sql, relations } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { shows } from './show'

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

/**
 * One thing a show can be warned for.
 *
 * `slug` is the stable key: migrations and seeds reference a warning by slug,
 * never by id, so an entry means the same thing in every environment (the
 * seeded rows use a literal `cw_<slug>` id for that reason).
 *
 * `category` groups GENERAL entries. Plain text rather than an enum so the
 * committee can add one without a deploy; `CONTENT_WARNING_CATEGORIES` in
 * shared/utils/contentWarnings.ts is the suggested list and drives sort order.
 * Always null for TECHNICAL.
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

/* ------------------------------------------------------------------ *
 * The links
 * ------------------------------------------------------------------ */

/**
 * Show ↔ warning, at one level. `level` is null exactly when the warning is
 * TECHNICAL.
 *
 * SQLite CHECK constraints may only reference columns of the same row, so that
 * half of the invariant is enforced in `PUT /api/shows/:id`. The CHECK below
 * is still the only thing constraining the enum in SQL.
 *
 * `onDelete: 'restrict'` on the warning, deliberately (ADR-0010).
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

/* ------------------------------------------------------------------ *
 * Archive
 * ------------------------------------------------------------------ */

/**
 * The pre-rework rows, verbatim, as they stood before migration 0016 wiped and
 * reseeded them.
 *
 * Declared here rather than only in migration SQL so they appear in the
 * Drizzle snapshot. No foreign keys — the tables they referenced have been
 * rebuilt — and no unique indexes, because the point is to hold what was
 * there, not to judge it. Never written by the application;
 * `GET /api/shows/:id/legacy-content-warnings` reads them.
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
   * The new vocabulary entry this row was remapped onto, or null if the alias map
   * had no target. Written once by migration 0016.
   *
   * It exists because the remap collapses rows: two archive titles can share one
   * live entry, so only one archive id survives as a live row and the other
   * would otherwise look dropped. No foreign key — the archive must stay
   * readable even if the entry it points at is later deleted.
   */
  mappedToWarningId: text('mapped_to_warning_id'),
  createdAt: text('created_at'),
}, table => [
  index('show_content_warnings_archive_show_id_idx').on(table.showId),
])
