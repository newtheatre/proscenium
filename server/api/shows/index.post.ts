import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createShow } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  longDescription: z.string().max(20000).optional().nullable(),
  programmeUrl: z.url().max(2048).optional().nullable(),
  externalUrl: z.url().max(2048).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  contentWarningNotes: z.string().max(2000).optional().nullable(),
  warningsConfirmedNone: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
})

// Warning links are not settable here: they are their own section on the
// detail page, where the vocabulary is loaded (ADR-0017).

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
    longDescription: body.longDescription,
    programmeUrl: body.programmeUrl,
    externalUrl: body.externalUrl,
    categoryId: body.categoryId,
    contentWarningNotes: body.contentWarningNotes,
    warningsConfirmedNone: body.warningsConfirmedNone ?? false,
    status: body.status,
  }).returning()

  if (!newShow) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create show' })
  }

  return newShow
})
