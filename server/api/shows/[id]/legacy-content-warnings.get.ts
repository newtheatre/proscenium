import { db, schema } from '@nuxthub/db'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id/legacy-content-warnings: warnings this show carried
 * before the rework that did not carry over.
 */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, readShow)

  // `mapped_to_warning_id IS NULL` is the migration's own record of what it
  // could not place: do not re-derive it (ADR-0004).
  return db
    .select({
      title: schema.contentWarningsArchive.title,
      kind: schema.showContentWarningsArchive.kind,
    })
    .from(schema.showContentWarningsArchive)
    .innerJoin(
      schema.contentWarningsArchive,
      eq(schema.contentWarningsArchive.id, schema.showContentWarningsArchive.contentWarningId),
    )
    .where(and(
      eq(schema.showContentWarningsArchive.showId, showId),
      isNull(schema.showContentWarningsArchive.mappedToWarningId),
    ))
    .orderBy(asc(schema.contentWarningsArchive.title))
})
