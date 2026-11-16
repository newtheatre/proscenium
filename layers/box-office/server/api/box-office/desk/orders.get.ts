// Find an order at the desk (R-3) by its booking reference or desk code, typed or scanned.
import { getQuery } from 'h3'
import { defineRoute } from '#kit'
import { findOrders } from '../../../desk'

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async (event) => {
  const q = getQuery(event).q
  return { orders: await findOrders(typeof q === 'string' ? q.slice(0, 64) : '') } // not-policy: longer than any reference or desk code
})
