import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import { issuePass } from '~~/shared/utils/abilities'

/** POST /api/pass-requests/:id/decline — no, and no pass is created. */
export default defineEventHandler(async (event) => {
  await authorize(event, issuePass)

  const id = getRouterParam(event, 'id')!
  const session = await getUserSession(event)

  const request = await db.select({ status: schema.passRequests.status })
    .from(schema.passRequests).where(eq(schema.passRequests.id, id)).get()

  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such request.' })
  if (request.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: `That request was already ${request.status.toLowerCase()}.` })
  }

  await db.update(schema.passRequests).set({
    status: 'DECLINED',
    decidedByUserId: session.user?.id ?? null,
    decidedAt: sql`(current_timestamp)`,
  }).where(eq(schema.passRequests.id, id))

  return { id, status: 'DECLINED' }
})
