import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({ performanceId: z.string().trim().min(1) })

/** GET /api/foh/incidents: the log for one of tonight's performances. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const { performanceId } = await getValidatedQuery(event, querySchema.parse)
  scopedPerformance(scope, performanceId)

  return db.select({
    id: schema.incidentLog.id,
    body: schema.incidentLog.body,
    supersedesId: schema.incidentLog.supersedesId,
    createdAt: schema.incidentLog.createdAt,
    authorName: schema.users.name,
  })
    .from(schema.incidentLog)
    .innerJoin(schema.users, eq(schema.incidentLog.authorUserId, schema.users.id))
    .where(eq(schema.incidentLog.performanceId, performanceId))
    .orderBy(desc(schema.incidentLog.createdAt))
})
