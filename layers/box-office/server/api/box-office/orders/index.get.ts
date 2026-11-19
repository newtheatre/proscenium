// Orders for staff (Box office specification, part 6, "Orders"): every order past the basket, newest
// first, filtered by state and how it was sold, and searched by booking reference or by the buyer's
// name or verified address through findAccounts.
import { and, count, eq, ne, or, sql } from 'drizzle-orm'
import { getQuery } from 'h3'
import { defineRoute, first, readListQuery, searchWords, useDb } from '#kit'
import { accountLabel, findAccounts, getPerformance, getProduction } from '#modules/core'
import { orders } from '../../../db/schema'
import { passOf } from '../../../orders'
import source from '../../../lists/orders'
import { ordersList } from '../../../../shared/lists'

const REFERENCE = /^[A-Z0-9-]{4,20}$/ // not-policy: the shape a booking reference can take

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? '').trim()
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const reference = typed.toUpperCase()
  const byReference = REFERENCE.test(reference) ? eq(orders.reference, reference) : undefined
  const byBuyer = words.length ? sql`${orders.accountId} IN (${await findAccounts(unit.view(), actor, typed, ordersList.id)})` : undefined
  const where = and(read.where(), ne(orders.state, 'basket'), typed ? (or(byReference, byBuyer) ?? sql`0`) : undefined)

  const db = useDb()
  const found = await db.select({
    id: orders.id, reference: orders.reference, state: orders.state, channel: orders.channel, accountId: orders.accountId,
    currency: orders.currency, totalMinor: orders.totalMinor, createdAt: orders.createdAt,
  }).from(orders).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(orders).where(where) as [{ n: number }]

  const rows = []
  for (const o of found) {
    const line = await first<{ performance_id: string, comp: number }>('SELECT performance_id, comp_request_id IS NOT NULL AS comp FROM box_office_order_lines WHERE order_id = ? ORDER BY id LIMIT 1', o.id)
    const performance = line ? await getPerformance(line.performance_id) : null
    rows.push({
      ...o,
      buyer: o.accountId ? await accountLabel(o.accountId) : null,
      show: performance ? (await getProduction(performance.productionId)).title : null,
      startsAt: performance?.startsAt ?? null,
      // Issued free from a request for complimentary tickets: shown as such, not as paid.
      complimentary: !!line?.comp,
      // Booked on a pass: named, with whether the pass itself is paid for.
      pass: await passOf(o.id),
    })
  }
  return { rows, total, dropped: read.dropped, ignoredWords, searchTooShort }
})
