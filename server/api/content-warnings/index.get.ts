import { db, schema } from '@nuxthub/db'
import { asc, eq, sql, and, type SQL } from 'drizzle-orm'
import { z } from 'zod/v4'
import { listContentWarnings } from '~~/shared/utils/abilities'

const querySchema = z.object({
  /** Include archived entries. The admin page wants them; the show editor does not. */
  includeArchived: z.enum(['true', 'false']).optional().default('false'),
  kind: z.enum(['TECHNICAL', 'GENERAL']).optional(),
})

/**
 * GET /api/content-warnings — the warning vocabulary. Staff only.
 *
 * `showCount` is a correlated subquery rather than a join + GROUP BY; the
 * admin page needs it to tell an unused entry from one it must not delete.
 * Ordered technical-first to match how the editor and the public page group
 * them, then `sort`, then title.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listContentWarnings)

  const query = await getValidatedQuery(event, querySchema.parse)

  const filters: SQL[] = []
  if (query.includeArchived !== 'true') filters.push(eq(schema.contentWarnings.archived, false))
  if (query.kind) filters.push(eq(schema.contentWarnings.kind, query.kind))

  return db
    .select({
      id: schema.contentWarnings.id,
      slug: schema.contentWarnings.slug,
      title: schema.contentWarnings.title,
      kind: schema.contentWarnings.kind,
      category: schema.contentWarnings.category,
      description: schema.contentWarnings.description,
      icon: schema.contentWarnings.icon,
      sort: schema.contentWarnings.sort,
      archived: schema.contentWarnings.archived,
      // Table and column names written out rather than interpolated. Drizzle
      // renders a column reference inside a `sql` template *unqualified* — this
      // came out as `WHERE "content_warning_id" = "id"`, where both names
      // resolve against the subquery's own table, so the comparison was never
      // true and every entry reported zero shows.
      showCount: sql<number>`(
        SELECT COUNT(*) FROM "show_content_warnings"
        WHERE "show_content_warnings"."content_warning_id" = "content_warnings"."id"
      )`.as('show_count'),
    })
    .from(schema.contentWarnings)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      // Technical first — not `asc(kind)`, which would sort GENERAL above it.
      sql`CASE ${schema.contentWarnings.kind} WHEN 'TECHNICAL' THEN 0 ELSE 1 END`,
      asc(schema.contentWarnings.sort),
      asc(schema.contentWarnings.title),
    )
})
