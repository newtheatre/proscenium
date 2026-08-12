import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { updateShow } from '~~/shared/utils/abilities'

/**
 * GET /api/content-warnings — the warning vocabulary, for the show editor.
 * Admin/Manager only.
 *
 * The list is shared across shows rather than free text, so that "Strobe
 * lighting" means the same thing on every production and a customer filtering
 * on it gets a complete answer. The import brought 384 of these across from the
 * legacy site.
 *
 * Archived entries are excluded: they stay in the table so existing shows keep
 * rendering, but should not be offered for new ones.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, updateShow)

  return db
    .select({
      id: schema.contentWarnings.id,
      title: schema.contentWarnings.title,
      icon: schema.contentWarnings.icon,
      legacyCategory: schema.contentWarnings.legacyCategory,
    })
    .from(schema.contentWarnings)
    .where(eq(schema.contentWarnings.archived, false))
    .orderBy(asc(schema.contentWarnings.title))
})
