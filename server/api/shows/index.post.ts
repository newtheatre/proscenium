import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createShow } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
})

/** POST /api/shows — create a new show. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  await authorize(event, createShow)

  const body = await readValidatedBody(event, bodySchema.parse)

  // Check for duplicate slug
  const existing = await db.select().from(schema.shows).where(eq(schema.shows.slug, body.slug)).get()
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: 'A show with this slug already exists' })
  }

  const [newShow] = await db.insert(schema.shows).values({
    title: body.title,
    slug: body.slug,
    subtitle: body.subtitle,
    description: body.description,
    status: body.status,
  }).returning()

  if (!newShow) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create show' })
  }

  return newShow
})
