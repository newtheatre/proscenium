import { db, schema } from '@nuxthub/db'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id/legacy-content-warnings — warnings this show carried
 * before the rework that did not carry over. Staff only.
 *
 * Returns only the unmapped ones: a title still on the show under its new name
 * is noise here. The show editor surfaces these for a human to replace
 * (ADR-0004).
 */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, readShow)

  // `mapped_to_warning_id IS NULL` is the migration's own record of what it
  // could not place. Deriving it here instead — by looking for archive ids
  // missing from the live table — would be wrong, because the remap collapses
  // rows: "Sexism" and "Misogyny" both became `sexism`, and only one of the two
  // ids survives.
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
