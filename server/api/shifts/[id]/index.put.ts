import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageShifts } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  /** Null empties the slot, which returns it to OPEN. */
  userId: z.string().trim().min(1).nullable().optional(),
  status: z.enum(schema.SHIFT_STATUSES).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})

/** PUT /api/shifts/:id — assign, reassign, confirm or empty a slot. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageShifts)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Shift ID is required' })

  const body = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  const existing = await db.select().from(schema.performanceShifts)
    .where(eq(schema.performanceShifts.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Shift not found' })

  const userId = body.userId === undefined ? existing.userId : body.userId
  // The check constraint pairs these two, so resolve them together rather than
  // letting a caller set a status the user column contradicts.
  const status = userId === null ? 'OPEN' : (body.status ?? (existing.status === 'OPEN' ? 'CONFIRMED' : existing.status))

  if (userId && userId !== existing.userId) {
    const assignee = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.id, userId)).get()
    if (!assignee) throw createError({ statusCode: 404, statusMessage: 'That person has no account here yet' })
  }

  if (existing.role === 'DUTY_MANAGER' && status === 'CONFIRMED') {
    await assertDutyManagerFree(existing.performanceId, id)
  }

  const wasConfirmed = existing.status === 'CONFIRMED'
  const [row] = await db.update(schema.performanceShifts).set({
    userId,
    status,
    notes: body.notes === undefined ? existing.notes : body.notes,
    confirmedAt: status === 'CONFIRMED' ? (wasConfirmed ? existing.confirmedAt : new Date().toISOString()) : null,
    // A manager touching the slot clears the fallback flag: that review is what
    // the flag was asking for (ADR-0026).
    needsEligibilityReview: false,
    assignedByUserId: userId ? user.id : null,
  }).where(eq(schema.performanceShifts.id, id)).returning()

  return row
})
