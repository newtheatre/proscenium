import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'

/**
 * POST /api/shifts/:id/claim: take an open slot. Eligibility is asked of
 * rehearsal through the one seam, and fails open with a flag (ADR-0026).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Shift ID is required' })

  const shift = await db.select().from(schema.performanceShifts)
    .where(eq(schema.performanceShifts.id, id)).get()
  if (!shift) throw createError({ statusCode: 404, statusMessage: 'Shift not found' })
  if (shift.status !== 'OPEN' || shift.userId) {
    throw createError({ statusCode: 409, statusMessage: 'Somebody has already taken that one.' })
  }

  const answer = await isEligible(user.id, SHIFT_ELIGIBILITY[shift.role])
  if (!answer.eligible) {
    throw createError({
      statusCode: 403,
      statusMessage: answer.missing.length
        ? `You need ${answer.missing.join(', ')} before you can take this shift.`
        : 'Your training record does not cover this shift yet.',
    })
  }

  const settings = await rotaSettings()
  const confirming = settings.autoConfirmClaims && !answer.needsReview

  if (shift.role === 'DUTY_MANAGER' && confirming) {
    await assertDutyManagerFree(shift.performanceId, shift.id)
  }

  const now = new Date().toISOString()
  const [row] = await db.update(schema.performanceShifts).set({
    userId: user.id,
    status: confirming ? 'CONFIRMED' : 'CLAIMED',
    claimedAt: now,
    confirmedAt: confirming ? now : null,
    // Allowed under the fail-open path, so a human should look (ADR-0026).
    needsEligibilityReview: answer.needsReview,
  }).where(and(
    eq(schema.performanceShifts.id, id),
    // Check-then-act: D1 has no interactive transaction, so the write itself
    // has to re-assert what the read saw or two claims both succeed.
    eq(schema.performanceShifts.status, 'OPEN'),
    isNull(schema.performanceShifts.userId),
  )).returning()

  if (!row) {
    throw createError({ statusCode: 409, statusMessage: 'Somebody has already taken that one.' })
  }

  return row
})
