import { db, schema } from '@nuxthub/db'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
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
  ageGuidance: z.string().max(200).optional().nullable(),
  latecomerPolicy: z.string().max(500).optional().nullable(),
  contentWarningNotes: z.string().max(2000).optional().nullable(),
  warningsConfirmedNone: z.boolean().optional(),
  /**
   * Full replacement of the warning links; omit to leave them alone. `level`
   * must be null for a technical warning and set for a general one.
   */
  contentWarnings: z.array(z.object({
    contentWarningId: z.string().min(1),
    level: z.enum(['MENTIONED', 'DISCUSSED', 'DEPICTED']).nullable(),
  })).max(80).optional(),
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
  if (body.ageGuidance !== undefined) updateData.ageGuidance = body.ageGuidance
  if (body.latecomerPolicy !== undefined) updateData.latecomerPolicy = body.latecomerPolicy
  if (body.contentWarningNotes !== undefined) updateData.contentWarningNotes = body.contentWarningNotes
  if (body.warningsConfirmedNone !== undefined) updateData.warningsConfirmedNone = body.warningsConfirmedNone
  if (body.status !== undefined) updateData.status = body.status

  // Replaced wholesale rather than diffed, in one batch, so the show is never
  // left briefly warningless.
  if (body.contentWarnings !== undefined) {
    // Last id wins on a repeat: the table is unique on (show, warning), so a
    // duplicate would fail mid-batch.
    const submitted = new Map(body.contentWarnings.map(w => [w.contentWarningId, w.level]))

    if (submitted.size > 0) {
      const ids = [...submitted.keys()]
      const vocabulary = await db
        .select({ id: schema.contentWarnings.id, kind: schema.contentWarnings.kind, title: schema.contentWarnings.title })
        .from(schema.contentWarnings)
        .where(inArray(schema.contentWarnings.id, ids))

      const byId = new Map(vocabulary.map(row => [row.id, row]))

      // "level is null iff the warning is technical" spans two tables, so
      // SQLite cannot express it as a CHECK. This is where it lives.
      for (const [id, level] of submitted) {
        const warning = byId.get(id)
        if (!warning) {
          throw createError({ statusCode: 400, statusMessage: `Unknown content warning: ${id}` })
        }
        if (warning.kind === 'TECHNICAL' && level !== null) {
          throw createError({
            statusCode: 400,
            statusMessage: `"${warning.title}" is a technical effect and cannot have a level`,
          })
        }
        if (warning.kind === 'GENERAL' && level === null) {
          throw createError({
            statusCode: 400,
            statusMessage: `"${warning.title}" needs a level: mentioned, discussed or depicted`,
          })
        }
      }
    }

    const links = [...submitted].map(([contentWarningId, level]) => ({ showId, contentWarningId, level }))

    // Chunked: each row binds three parameters and D1 allows 100 per statement
    // (ADR-0006).
    const CHUNK = 30
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
