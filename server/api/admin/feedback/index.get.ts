import { eq, sql } from 'drizzle-orm'
import { feedbackList } from '#shared/utils/feedback-list'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { tableColumns, whereFrom } from '#server/utils/list-filters'

const query = filterQuerySchema(feedbackList)

// Every problem report and idea, newest first, paged in SQL (0005). The browser's user agent and
// recent failures stay with the triage run: the screen needs what was said, where and by whom.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'feedback.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const { where, orderBy } = whereFrom(feedbackList, input, {
    column: tableColumns(schema.feedbackReports),
    search: [schema.feedbackReports.body, schema.feedbackReports.pagePath],
  })

  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.feedbackReports)
    .where(where)

  const items = await db.select({
    id: schema.feedbackReports.id,
    kind: schema.feedbackReports.kind,
    body: schema.feedbackReports.body,
    pagePath: schema.feedbackReports.pagePath,
    status: schema.feedbackReports.status,
    issueUrl: schema.feedbackReports.issueUrl,
    reporterName: schema.users.name,
    createdAt: schema.feedbackReports.createdAt,
  })
    .from(schema.feedbackReports)
    .leftJoin(schema.users, eq(schema.users.id, schema.feedbackReports.reporterId))
    .where(where)
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})
