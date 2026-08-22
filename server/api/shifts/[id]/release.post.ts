import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

/**
 * POST /api/shifts/:id/release: give back a claim. Only before it is
 * confirmed: after that it is a promise, and the manager unpicks it.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Shift ID is required' })

  const shift = await db.select().from(schema.performanceShifts)
    .where(eq(schema.performanceShifts.id, id)).get()
  if (!shift) throw createError({ statusCode: 404, statusMessage: 'Shift not found' })
  if (shift.userId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'That is not your shift.' })
  }
  if (shift.status === 'CONFIRMED') {
    throw createError({
      statusCode: 409,
      statusMessage: 'That shift is confirmed. Ask the front-of-house manager to take you off it.',
    })
  }

  const [row] = await db.update(schema.performanceShifts).set({
    userId: null,
    status: 'OPEN',
    claimedAt: null,
    confirmedAt: null,
    needsEligibilityReview: false,
  }).where(eq(schema.performanceShifts.id, id)).returning()

  return row
})
