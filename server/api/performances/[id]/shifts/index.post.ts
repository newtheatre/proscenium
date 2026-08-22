import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageShifts } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  role: z.enum(schema.SHIFT_ROLES),
  /** Omit for an open slot; giving one assigns and confirms it. */
  userId: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(500).optional(),
})

/** POST /api/performances/:id/shifts: add a slot, open or filled. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageShifts)

  const performanceId = getRouterParam(event, 'id')
  if (!performanceId) throw createError({ statusCode: 400, statusMessage: 'Performance ID is required' })

  const body = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  const performance = await db.select({ id: schema.performances.id }).from(schema.performances)
    .where(eq(schema.performances.id, performanceId)).get()
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'Performance not found' })

  if (body.userId) {
    const assignee = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.id, body.userId)).get()
    if (!assignee) throw createError({ statusCode: 404, statusMessage: 'That person has no account here yet' })
    if (body.role === 'DUTY_MANAGER') await assertDutyManagerFree(performanceId)
  }

  const [row] = await db.insert(schema.performanceShifts).values({
    performanceId,
    role: body.role,
    userId: body.userId ?? null,
    status: body.userId ? 'CONFIRMED' : 'OPEN',
    confirmedAt: body.userId ? new Date().toISOString() : null,
    assignedByUserId: body.userId ? user.id : null,
    notes: body.notes ?? null,
  }).returning()

  return row
})
