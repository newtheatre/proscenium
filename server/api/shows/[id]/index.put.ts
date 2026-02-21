import { shows } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateShow } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only').optional(),
  subtitle: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  posterUrl: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
})

export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, updateShow)

  const existing = await db.select().from(shows).where(eq(shows.id, showId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // Check slug uniqueness if changing
  if (body.slug !== undefined && body.slug !== existing.slug) {
    const conflict = await db.select().from(shows).where(eq(shows.slug, body.slug)).get()
    if (conflict) {
      throw createError({ statusCode: 400, statusMessage: 'A show with this slug already exists' })
    }
  }

  const updateData: Partial<typeof existing> = {}
  if (body.title !== undefined) updateData.title = body.title
  if (body.slug !== undefined) updateData.slug = body.slug
  if (body.subtitle !== undefined) updateData.subtitle = body.subtitle
  if (body.description !== undefined) updateData.description = body.description
  if (body.posterUrl !== undefined) updateData.posterUrl = body.posterUrl
  if (body.status !== undefined) updateData.status = body.status

  if (Object.keys(updateData).length === 0) {
    return existing
  }

  const [updated] = await db.update(shows)
    .set(updateData)
    .where(eq(shows.id, showId))
    .returning()

  return updated
})
