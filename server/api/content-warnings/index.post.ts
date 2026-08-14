import { db, schema } from '@nuxthub/db'
import { eq, or } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createContentWarning } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  title: z.string().min(1, 'Title is required').max(80),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only').optional(),
  kind: z.enum(['TECHNICAL', 'GENERAL']),
  category: z.string().max(60).optional().nullable(),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().max(80).optional().nullable(),
  sort: z.number().int().min(0).max(9999).optional(),
})

/**
 * POST /api/content-warnings — add a vocabulary entry. Admin/Manager only.
 *
 * Both `slug` and `title` are unique, so both are checked here rather than
 * letting one surface as a 500 from the index. The slug is derived from the
 * title when not given; it is the stable key, so it is worth being deliberate
 * about.
 *
 * A technical warning has no category — it is its own group on the show page,
 * and a category on it would never be rendered.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, createContentWarning)

  const body = await readValidatedBody(event, bodySchema.parse)

  const slug = body.slug ?? contentWarningSlug(body.title)
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Title must contain at least one letter or number' })
  }

  const conflict = await db
    .select({ slug: schema.contentWarnings.slug, title: schema.contentWarnings.title })
    .from(schema.contentWarnings)
    .where(or(eq(schema.contentWarnings.slug, slug), eq(schema.contentWarnings.title, body.title)))
    .get()

  if (conflict) {
    throw createError({
      statusCode: 400,
      statusMessage: conflict.slug === slug
        ? `A content warning with the slug "${slug}" already exists`
        : 'A content warning with this title already exists',
    })
  }

  const [created] = await db.insert(schema.contentWarnings).values({
    slug,
    title: body.title,
    kind: body.kind,
    category: body.kind === 'TECHNICAL' ? null : (body.category ?? null),
    description: body.description ?? null,
    icon: body.icon ?? null,
    sort: body.sort ?? 0,
  }).returning()

  return created
})
