import { db, schema } from '@nuxthub/db'
import { alias } from 'drizzle-orm/sqlite-core'
import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { issuePass } from '~~/shared/utils/abilities'

const querySchema = paginationSchema.extend({
  status: z.enum(schema.PASS_REQUEST_STATUSES).optional().default('PENDING'),
})

/** GET /api/pass-requests — the box office queue of people wanting a pass. */
export default defineEventHandler(async (event) => {
  await authorize(event, issuePass)

  const query = await getValidatedQuery(event, querySchema.parse)
  const requester = alias(schema.users, 'requester')
  const where = eq(schema.passRequests.status, query.status)

  const [rows, [total]] = await Promise.all([
    db.select({
      id: schema.passRequests.id,
      status: schema.passRequests.status,
      quotedPence: schema.passRequests.quotedPence,
      note: schema.passRequests.note,
      requestedAt: schema.passRequests.requestedAt,
      passTypeId: schema.passTypes.id,
      passTypeName: schema.passTypes.name,
      userId: requester.id,
      requesterName: requester.name,
      requesterEmail: requester.email,
    })
      .from(schema.passRequests)
      .innerJoin(schema.passTypes, eq(schema.passTypes.id, schema.passRequests.passTypeId))
      .leftJoin(requester, eq(requester.id, schema.passRequests.userId))
      .where(where)
      .orderBy(desc(schema.passRequests.requestedAt))
      .limit(query.limit).offset(offsetFor(query)),
    db.select({ value: count() }).from(schema.passRequests).where(where),
  ])

  return paginated(rows, total?.value ?? 0, query)
})
