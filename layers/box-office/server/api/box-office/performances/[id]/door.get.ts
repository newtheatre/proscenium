// The door list for one performance (Box office specification, part 6, "Door list"; BO-40): each
// order holding valid tickets for it, with how many are used, searched by booking reference or by
// the buyer's name or address through findAccounts. Those still to arrive are the default view.
// A reservation not yet paid for is listed too, as Not paid, with its tickets and what is owed, so
// the door can find it by name and send them to the till (D3, box office review); it is never
// "arrived", since nobody on it can be admitted until it is paid. One released unpaid stays listed,
// as Released, so the door can send its buyer to the till to be seated again if seats are free.
import { and, count, eq, or, sql } from 'drizzle-orm'
import { getQuery, getRouterParam } from 'nuxt/server'
import { defineRoute, readListQuery, searchWords, useDb } from '#kit'
import { accountLabel, findAccounts, getPerformance } from '#modules/core'
import { orders } from '../../../../db/schema'
import source, { unusedTickets } from '../../../../lists/door-list'
import { doorList } from '../../../../../shared/lists'

const REFERENCE = /^[A-Z0-9-]{4,20}$/ // not-policy: the shape a booking reference can take

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (event, { record, actor, unit }) => {
  const performanceId = record!.id!
  await getPerformance(performanceId)
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? '').trim()
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { words, ignoredWords, searchTooShort } = searchWords(typed)
  const reference = typed.toUpperCase()
  const byReference = REFERENCE.test(reference) ? eq(orders.reference, reference) : undefined
  const byBuyer = words.length ? sql`${orders.accountId} IN (${await findAccounts(unit.view(), actor, typed, doorList.id)})` : undefined
  const tickets = sql`(SELECT count(*) FROM box_office_tickets k JOIN box_office_order_lines l ON l.id = k.order_line_id
    WHERE l.order_id = box_office_orders.id AND k.performance_id = ${performanceId} AND k.state = 'valid')`
  const reserved = sql`(SELECT count(*) FROM box_office_order_lines l WHERE l.order_id = box_office_orders.id AND l.performance_id = ${performanceId}
    AND l.kind = 'ticket' AND l.state = 'live' AND (box_office_orders.state IN ('reserved', 'awaiting_payment')
      OR (box_office_orders.state = 'expired' AND box_office_orders.reserved_at IS NOT NULL)))`
  const arrived = read.filters.arrived
  const where = and(
    read.where(),
    sql`(${tickets} > 0 OR ${reserved} > 0)`,
    arrived === undefined ? undefined : arrived ? sql`${unusedTickets(performanceId)} = 0 AND ${reserved} = 0` : sql`(${unusedTickets(performanceId)} > 0 OR ${reserved} > 0)`,
    typed ? (or(byReference, byBuyer) ?? sql`0`) : undefined,
  )

  const db = useDb()
  const found = await db.select({ id: orders.id, reference: orders.reference, accountId: orders.accountId, channel: orders.channel, at: sql<number>`coalesce(${orders.confirmedAt}, ${orders.createdAt})`, totalMinor: orders.totalMinor, currency: orders.currency, state: orders.state, tickets, reserved, unused: unusedTickets(performanceId) })
    .from(orders).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(orders).where(where) as [{ n: number }]
  const rows = []
  for (const o of found) {
    const unpaid = Number(o.reserved) > 0
    rows.push({
      id: o.id, reference: o.reference, buyer: o.accountId ? await accountLabel(o.accountId) : null, channel: o.channel, at: Number(o.at),
      tickets: unpaid ? Number(o.reserved) : Number(o.tickets), admitted: unpaid ? 0 : Number(o.tickets) - Number(o.unused),
      ...unpaid ? { unpaid: { amountDueMinor: o.totalMinor, currency: o.currency } } : {},
      ...o.state === 'expired' ? { released: true } : {},
    })
  }
  return { rows, total, dropped: read.dropped, ignoredWords, searchTooShort }
})
