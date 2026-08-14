import { db, schema } from '@nuxthub/db'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id/legacy-content-warnings — what this show carried before the
 * warning rework, and did not carry over. Staff only.
 *
 * Migration 0016 remapped 963 of 998 links onto the new vocabulary. The 35 it
 * could not place were titles too vague to restate — "Adult content", "Political
 * Themes" — and inventing a mapping for them would have been worse than
 * dropping them. But a company wrote them down for a reason, so the show editor
 * shows them and asks a human to decide.
 *
 * Returns only the unmapped ones: a title still present on the show under its
 * new name is noise here, not information.
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
