import { db, schema } from '@nuxthub/db'
import { and, eq, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateContentWarning } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  title: z.string().min(1).max(80).optional(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only').optional(),
  kind: z.enum(['TECHNICAL', 'GENERAL']).optional(),
  category: z.string().max(60).optional().nullable(),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().max(80).optional().nullable(),
  sort: z.number().int().min(0).max(9999).optional(),
  archived: z.boolean().optional(),
})

/**
 * PUT /api/content-warnings/:id — edit a vocabulary entry.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Content warning ID is required' })
  }

  await authorize(event, updateContentWarning)

  const existing = await db.select().from(schema.contentWarnings).where(eq(schema.contentWarnings.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Content warning not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.kind !== undefined && body.kind !== existing.kind) {
    const inUse = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.showContentWarnings)
      .where(eq(schema.showContentWarnings.contentWarningId, id))
      .get()

    if ((inUse?.count ?? 0) > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `Cannot change the type of this warning while ${inUse?.count} show(s) use it. Remove it from those shows first, or archive this entry and add a new one.`,
      })
    }
  }

  // Uniqueness on whichever of slug/title is actually changing.
  const nextSlug = body.slug ?? existing.slug
  const nextTitle = body.title ?? existing.title
  if (nextSlug !== existing.slug || nextTitle !== existing.title) {
    const conflict = await db
      .select({ slug: schema.contentWarnings.slug })
      .from(schema.contentWarnings)
      .where(and(
        ne(schema.contentWarnings.id, id),
        or(eq(schema.contentWarnings.slug, nextSlug), eq(schema.contentWarnings.title, nextTitle)),
      ))
      .get()

    if (conflict) {
      throw createError({
        statusCode: 400,
        statusMessage: conflict.slug === nextSlug
          ? `A content warning with the slug "${nextSlug}" already exists`
          : 'A content warning with this title already exists',
      })
    }
  }

  const updateData: Partial<typeof existing> = {}
  if (body.title !== undefined) updateData.title = body.title
  if (body.slug !== undefined) updateData.slug = body.slug
  if (body.kind !== undefined) updateData.kind = body.kind
  if (body.description !== undefined) updateData.description = body.description
  if (body.icon !== undefined) updateData.icon = body.icon
  if (body.sort !== undefined) updateData.sort = body.sort
  if (body.archived !== undefined) updateData.archived = body.archived

  // A technical warning is its own group on the show page, so a category on it
  // would never be rendered. Clear it rather than storing something misleading.
  const resultingKind = body.kind ?? existing.kind
  if (resultingKind === 'TECHNICAL') updateData.category = null
  else if (body.category !== undefined) updateData.category = body.category

  if (Object.keys(updateData).length === 0) {
    return existing
  }

  const [updated] = await db.update(schema.contentWarnings)
    .set(updateData)
    .where(eq(schema.contentWarnings.id, id))
    .returning()

  return updated
})
