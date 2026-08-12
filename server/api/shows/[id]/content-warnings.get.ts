import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { updateShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id/content-warnings — the warning links for one show.
 * Admin/Manager only.
 *
 * Its own endpoint rather than part of the admin shows listing: one imported
 * show carries 72 warnings, and the listing has no use for any of them. The
 * editor fetches this when it opens.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, updateShow)

  const showId = getRouterParam(event, 'id')
  if (!showId) throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })

  return db
    .select({
      contentWarningId: schema.showContentWarnings.contentWarningId,
      kind: schema.showContentWarnings.kind,
      title: schema.contentWarnings.title,
    })
    .from(schema.showContentWarnings)
    .innerJoin(
      schema.contentWarnings,
      eq(schema.showContentWarnings.contentWarningId, schema.contentWarnings.id),
    )
    .where(eq(schema.showContentWarnings.showId, showId))
})
