// The command palette's search for orders (core.search-source): the orders list's own search, by
// booking reference or by the buyer's name or verified address, answering ids for the resolver.
import { and, desc, eq, ne, or, sql } from 'drizzle-orm'
import { getQuery } from 'h3'
import { defineRoute, searchWords, useDb } from '#kit'
import { findAccounts } from '#modules/core'
import { orders } from '../../db/schema'
import { ordersList } from '../../../shared/lists'

const REFERENCE = /^[A-Z0-9-]{4,20}$/ // not-policy: the shape a booking reference can take
const MOST = 20 // not-policy: one page of palette results

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const typed = String(getQuery(event).q ?? '').slice(0, 120).trim() // not-policy: shape bound
  if (!typed) return { ids: [] }
  const reference = typed.toUpperCase()
  const byReference = REFERENCE.test(reference) ? eq(orders.reference, reference) : undefined
  const { words } = searchWords(typed)
  const byBuyer = words.length ? sql`${orders.accountId} IN (${await findAccounts(unit.view(), actor, typed, ordersList.id)})` : undefined
  const matched = or(byReference, byBuyer)
  if (!matched) return { ids: [] }
  const found = await useDb().select({ id: orders.id }).from(orders).where(and(ne(orders.state, 'basket'), matched)).orderBy(desc(orders.createdAt)).limit(MOST)
  return { ids: found.map(o => o.id) }
})
