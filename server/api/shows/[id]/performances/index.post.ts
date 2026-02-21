import { shows, performances } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createPerformance } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  venueId: z.string().min(1, 'Venue is required'),
  startsAt: z.number().int('startsAt must be a unix timestamp'),
  doorsAt: z.number().int().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  intervalCount: z.number().int().nonnegative().optional().default(0),
  intervalMinutes: z.number().int().positive().optional().nullable(),
  capacityOverride: z.number().int().positive().optional().nullable(),
  status: z.enum(['DRAFT', 'ON_SALE', 'CANCELLED']).optional().default('DRAFT'),
  notes: z.string().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, createPerformance)

  const show = await db.select().from(shows).where(eq(shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  const [newPerformance] = await db.insert(performances).values({
    showId,
    venueId: body.venueId,
    startsAt: new Date(body.startsAt * 1000),
    doorsAt: body.doorsAt ? new Date(body.doorsAt * 1000) : null,
    durationMinutes: body.durationMinutes,
    intervalCount: body.intervalCount,
    intervalMinutes: body.intervalMinutes,
    capacityOverride: body.capacityOverride,
    status: body.status,
    notes: body.notes,
  }).returning()

  if (!newPerformance) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create performance' })
  }

  return newPerformance
})
