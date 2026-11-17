// Data requests for staff (Identity Doc part 5; ID-35): every export and erasure on the list
// format, the nearest respond-by date first, filtered by kind, state, closed and overdue, and
// searched by the person's name or verified address through findAccounts.
import { and, count, sql } from 'drizzle-orm'
import { getQuery } from 'h3'
import { defineRoute, nowMs, readListQuery, searchWords, useDb } from '#kit'
import { dataRequests } from '../../../db/identity'
import { findAccounts } from '../../../identity/find'
import { accountLabel } from '../../../identity/accounts'
import source from '../../../lists/data-requests'
import { dataRequestsList } from '../../../../shared/identity-lists'

export default defineRoute({ ability: 'core.data-request.manage', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = (Array.isArray(query.q) ? query.q[0] : query.q) ?? ''
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const where = and(
    read.where(),
    words.length ? sql`${dataRequests.accountId} IN (${await findAccounts(unit.view(), actor, typed, dataRequestsList.id)})` : undefined,
  )

  const db = useDb()
  const found = await db.select({
    id: dataRequests.id, accountId: dataRequests.accountId, kind: dataRequests.kind, state: dataRequests.state,
    requestedAt: dataRequests.requestedAt, respondBy: dataRequests.respondBy, holds: dataRequests.holds, closedAt: dataRequests.closedAt,
  }).from(dataRequests).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(dataRequests).where(where) as [{ n: number }]

  const now = nowMs()
  const rows = []
  for (const r of found) {
    rows.push({
      id: r.id, accountId: r.accountId, person: await accountLabel(r.accountId!), kind: r.kind, state: r.state,
      requestedAt: r.requestedAt, respondBy: r.respondBy, holds: r.holds ? JSON.parse(r.holds) as string[] : [],
      closed: r.closedAt !== null, overdue: r.closedAt === null && r.respondBy < now,
    })
  }
  return { rows, total, dropped: read.dropped, ignoredWords, searchTooShort }
})
