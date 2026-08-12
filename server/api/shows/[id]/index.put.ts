import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import type { BatchItem } from 'drizzle-orm/batch'
import { updateShow } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only').optional(),
  subtitle: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  posterUrl: z.string().optional().nullable(),
  longDescription: z.string().max(20000).optional().nullable(),
  programmeUrl: z.url().max(2048).optional().nullable(),
  externalUrl: z.url().max(2048).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  contentWarningNotes: z.string().max(2000).optional().nullable(),
  warningsConfirmedNone: z.boolean().optional(),
  /** Full replacement of the show's warning links. Omit to leave them alone. */
  contentWarnings: z.array(z.object({
    contentWarningId: z.string().min(1),
    kind: z.enum(['ACTION', 'DIALOGUE', 'TECHNICAL']),
  })).max(120).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
})

/** PUT /api/shows/:id — update a show. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, updateShow)

  const existing = await db.select().from(schema.shows).where(eq(schema.shows.id, showId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // Check slug uniqueness if changing
  if (body.slug !== undefined && body.slug !== existing.slug) {
    const conflict = await db.select().from(schema.shows).where(eq(schema.shows.slug, body.slug)).get()
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
  if (body.longDescription !== undefined) updateData.longDescription = body.longDescription
  if (body.programmeUrl !== undefined) updateData.programmeUrl = body.programmeUrl
  if (body.externalUrl !== undefined) updateData.externalUrl = body.externalUrl
  if (body.categoryId !== undefined) updateData.categoryId = body.categoryId
  if (body.contentWarningNotes !== undefined) updateData.contentWarningNotes = body.contentWarningNotes
  if (body.warningsConfirmedNone !== undefined) updateData.warningsConfirmedNone = body.warningsConfirmedNone
  if (body.status !== undefined) updateData.status = body.status

  // Warning links are replaced wholesale rather than diffed: the editor sends
  // the full set, and doing it in one batch keeps the show from being left
  // briefly warningless if a later statement fails.
  //
  // Chunked because D1 allows at most 100 bound parameters per statement and
  // each row binds three. One imported show carries 72 warnings, which would be
  // 216 — so a single insert would have failed on real data.
  if (body.contentWarnings !== undefined) {
    const CHUNK = 30
    const links = body.contentWarnings.map(w => ({
      showId,
      contentWarningId: w.contentWarningId,
      kind: w.kind,
    }))

    const statements: BatchItem<'sqlite'>[] = [
      db.delete(schema.showContentWarnings).where(eq(schema.showContentWarnings.showId, showId)),
    ]
    for (let i = 0; i < links.length; i += CHUNK) {
      statements.push(db.insert(schema.showContentWarnings).values(links.slice(i, i + CHUNK)))
    }

    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }

  if (Object.keys(updateData).length === 0) {
    return existing
  }

  const [updated] = await db.update(schema.shows)
    .set(updateData)
    .where(eq(schema.shows.id, showId))
    .returning()

  return updated
})
