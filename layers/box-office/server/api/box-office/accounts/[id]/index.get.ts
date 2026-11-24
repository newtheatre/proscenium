// The Box office tab on a person's console page: their bookings, newest first, and the passes they
// hold with each one's code, so staff need not open the pass type's Holders list to read it out.
import { getRouterParam } from 'nuxt/server'
import { all, defineRoute } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { getPerformance, getProduction } from '#modules/core'
import { mayReadPassCodes, passesHeldBy } from '../../../../pass-holding'

const MOST = 50 // not-policy: more bookings than a tab is read for

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async (event, { actor }) => {
  const accountId = getRouterParam(event, 'id', { decode: true })!
  const orders = await all<{ id: string, reference: string, state: string, currency: string, total_minor: number, created_at: number, performance_id: string | null }>(
    `SELECT o.id, o.reference, o.state, o.currency, o.total_minor, o.created_at,
        (SELECT l.performance_id FROM box_office_order_lines l WHERE l.order_id = o.id AND l.performance_id IS NOT NULL ORDER BY l.rowid LIMIT 1) AS performance_id
      FROM box_office_orders o WHERE o.state <> 'basket' AND o.account_id IN (${accountScopeSql('?1')}) ORDER BY o.created_at DESC, o.id LIMIT ${MOST}`, accountId)
  const codes = await mayReadPassCodes(actor)
  return {
    orders: await Promise.all(orders.map(async (o) => {
      const performance = o.performance_id ? await getPerformance(o.performance_id).catch(() => null) : null
      const title = performance ? (await getProduction(performance.productionId).catch(() => null))?.title ?? null : null
      return { id: o.id, reference: o.reference, state: o.state, currency: o.currency, totalMinor: o.total_minor, createdAt: o.created_at, show: title, startsAt: performance?.startsAt ?? null }
    })),
    passes: (await passesHeldBy(accountId)).map(p => ({ ...p, code: codes ? p.code : null })),
  }
})
