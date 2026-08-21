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
