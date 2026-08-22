import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { workFoh } from '~~/shared/utils/abilities'

/** GET /api/foh/performances/:id/report — the stored record, if it is closed. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const performanceId = getRouterParam(event, 'id')!

  const scope = await requireFohScope(user)
  scopedPerformance(scope, performanceId)

  // The report carries takings, comps and the incident log. Reading it needs
  // the same standing as signing the night off (docs/11 §2.1).
  if (!await mayApproveComps(user, scope.night)) {
    throw createError({ statusCode: 403, statusMessage: 'Only tonight’s duty manager can read the end-of-night report.' })
  }

  const report = await db.select({
    id: schema.performanceReports.id,
    night: schema.performanceReports.night,
    closedAt: schema.performanceReports.closedAt,
    autoClosed: schema.performanceReports.autoClosed,
    closingNote: schema.performanceReports.closingNote,
    checklist: schema.performanceReports.checklist,
    payload: schema.performanceReports.payload,
    closedBy: schema.users.name,
  })
    .from(schema.performanceReports)
    .leftJoin(schema.users, eq(schema.users.id, schema.performanceReports.closedByUserId))
    .where(eq(schema.performanceReports.performanceId, performanceId))
    .get()

  return { closed: Boolean(report), report: report ?? null }
})
