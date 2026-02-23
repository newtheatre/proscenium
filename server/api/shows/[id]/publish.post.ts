import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateShow, updatePerformance } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  /** If true, updates all non-cancelled performances to ON_SALE. */
  markPerformancesOnSale: z.boolean().optional().default(false),
})

/**
 * POST /api/shows/:id/publish
 *
 * Sets the show status to PUBLISHED and optionally transitions all
 * non-cancelled performances from DRAFT → ON_SALE.
 *
 * Requires both updateShow and updatePerformance abilities.
 */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, updateShow)

  const show = await db.select().from(schema.shows).where(eq(schema.shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // Update show status to PUBLISHED
  const [updatedShow] = await db.update(schema.shows)
    .set({ status: 'PUBLISHED' })
    .where(eq(schema.shows.id, showId))
    .returning()

  let updatedPerformanceCount = 0

  if (body.markPerformancesOnSale) {
    await authorize(event, updatePerformance)

    // Update all non-cancelled performances to ON_SALE
    const result = await db.update(schema.performances)
      .set({ status: 'ON_SALE' })
      .where(eq(schema.performances.showId, showId))
      .returning()

    updatedPerformanceCount = result.length
  }

  return {
    show: updatedShow,
    updatedPerformanceCount,
  }
})
