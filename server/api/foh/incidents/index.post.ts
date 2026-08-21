import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  performanceId: z.string().trim().min(1),
  body: z.string().trim().min(1).max(2000),
  /** Set when this entry corrects an earlier one; both stay. */
  supersedesId: z.string().trim().min(1).optional(),
})

/**
 * POST /api/foh/incidents — add an entry. There is deliberately no update or
 * delete route: corrections are new entries (ADR-0027's reasoning).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const input = await readValidatedBody(event, bodySchema.parse)
  scopedPerformance(scope, input.performanceId)

  if (input.supersedesId) {
    const original = await db.select({ id: schema.incidentLog.id }).from(schema.incidentLog)
      .where(and(
        eq(schema.incidentLog.id, input.supersedesId),
        eq(schema.incidentLog.performanceId, input.performanceId),
      )).get()
    if (!original) {
      throw createError({ statusCode: 404, statusMessage: 'That entry is not on this performance.' })
    }
  }

  const [row] = await db.insert(schema.incidentLog).values({
    performanceId: input.performanceId,
    authorUserId: user.id,
    body: input.body,
    supersedesId: input.supersedesId ?? null,
  }).returning()

  return row
})
