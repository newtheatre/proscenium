import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  checklist: z.object({
    noShowsReleased: z.boolean(),
    incidentsReviewed: z.boolean(),
  }),
  closingNote: z.string().trim().max(2000).nullable().optional(),
})

/** POST /api/foh/performances/:id/close: sign the night off. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const performanceId = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, bodySchema.parse)

  const scope = await requireFohScope(user)
  scopedPerformance(scope, performanceId)

  // The same people who approve a comp sign the night off (docs/12 §4.1).
  const night = showNightDate()
  if (!await mayApproveComps(user, night)) {
    throw createError({ statusCode: 403, statusMessage: 'Only tonight’s duty manager can close the night.' })
  }

  const existing = await db.select({ id: schema.performanceReports.id })
    .from(schema.performanceReports)
    .where(eq(schema.performanceReports.performanceId, performanceId)).get()
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'That night has already been closed.' })
  }

  const report = await closeNight({
    performanceId,
    closedByUserId: user.id,
    autoClosed: false,
    closingNote: input.closingNote ?? null,
    checklist: input.checklist,
  })

  return { id: report.id, night: report.night }
})
