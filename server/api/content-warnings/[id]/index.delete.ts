import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import { deleteContentWarning } from '~~/shared/utils/abilities'

/**
 * DELETE /api/content-warnings/:id. Remove a vocabulary entry. Admin only.
 * Refused while any show carries it; archive instead (ADR-0010).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Content warning ID is required' })
  }

  await authorize(event, deleteContentWarning)

  const existing = await db.select().from(schema.contentWarnings).where(eq(schema.contentWarnings.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Content warning not found' })
  }

  // Checked explicitly rather than relying on the FK failure alone, so the
  // message can say how many shows are in the way.
  const inUse = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.showContentWarnings)
    .where(eq(schema.showContentWarnings.contentWarningId, id))
    .get()

  if ((inUse?.count ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete "${existing.title}" because ${inUse?.count} show(s) use it. Archive it instead to stop offering it on new shows.`,
    })
  }

  try {
    await db.delete(schema.contentWarnings).where(eq(schema.contentWarnings.id, id))
  }
  catch {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete "${existing.title}" because a show still uses it`,
    })
  }

  return { message: 'Content warning deleted successfully' }
})
