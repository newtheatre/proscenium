/**
 * Content warnings: a curated vocabulary, and the shows that carry each entry.
 *
 * The NNT thinks about this in two parts, and the schema mirrors that split:
 *
 *   TECHNICAL — a small closed set of production effects (strobe, loud noise,
 *     haze). Either the show does it or it does not; there is no intensity, so
 *     the link carries no level.
 *   GENERAL — a theme (murder, suicide, racism), which appears at one of three
 *     levels: MENTIONED (referred to in passing), DISCUSSED (talked about at
 *     length), DEPICTED (shown on stage). One level per warning per show.
 *
 * This replaces the ACTION / DIALOGUE / TECHNICAL "axis" model inherited from
 * the legacy Django import, which conflated a *category of warning* with an
 * *intensity* and could only express two points of the latter. See
 * docs/decisions/0004-content-warning-model.md.
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
 * `slug` is the stable key. Migrations and seeds reference a warning by slug,
 * never by id, so the same entry means the same thing in dev and production —
 * the seeded rows use a literal `cw_<slug>` id for exactly that reason.
 *
 * `category` groups GENERAL entries in the picker and on the show page. It is
 * plain text rather than an enum so the committee can add one without a deploy;
 * `CONTENT_WARNING_CATEGORIES` in shared/utils/contentWarnings.ts is the
 * suggested list, and drives sort order. Always null for TECHNICAL entries,
 * which are their own group.
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
 * Show ↔ warning, at one level.
 *
 * `level` is null exactly when the warning is TECHNICAL. SQLite CHECK
 * constraints may only reference columns of the same row, so that half of the
 * invariant cannot live here — `PUT /api/shows/:id` looks up the submitted
 * warnings' kinds and rejects a mismatch. The check below is still worth having
 * because it is the only thing constraining the enum in SQL.
 *
 * `onDelete: 'restrict'` on the warning, deliberately. Cascade would let a
 * delete from the admin vocabulary page silently strip that warning from every
 * show carrying it, with no warning and no trace. Archiving is the retirement
 * path, exactly as it is for ticket types.
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
 * The pre-rework rows, verbatim: 424 vocabulary entries and ~1,001 links as they
 * stood before migration 0016 wiped and reseeded them.
 *
 * Declared here rather than existing only in hand-written migration SQL so they
 * appear in the Drizzle snapshot and a future maintainer can find them. No
 * foreign keys — the tables they referenced have been rebuilt — and no unique
 * indexes, because the point is to hold what was there, not to judge it.
 *
 * Never written by the application. `GET /api/shows/:id/legacy-content-warnings`
 * reads them so the show editor can show what did not carry over.
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
   * The new vocabulary entry this row was remapped onto, or null if the alias
   * map had no target for its title.
   *
   * Written once by migration 0016 and never again. It exists because the
   * remap collapses rows — "Sexism" and "Misogyny" both became `sexism`, so
   * only one of the two archive ids survives as a live row. Without this column
   * the other looks unmapped, and the show editor would tell staff a warning
   * had been dropped when it is sitting right there under its new name.
   *
   * No foreign key: the archive must stay readable even if the entry it points
   * at is later deleted.
   */
  mappedToWarningId: text('mapped_to_warning_id'),
  createdAt: text('created_at'),
}, table => [
  index('show_content_warnings_archive_show_id_idx').on(table.showId),
])
