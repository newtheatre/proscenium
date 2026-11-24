// Find an order at the desk (R-3) by its booking reference or desk code, typed or scanned, or by the buyer's name for someone who may look people up.
import { getQuery } from 'nuxt/server'
import { defineRoute } from '#kit'
import { findOrders } from '../../../desk'

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async (event, { unit, actor }) => {
  const q = getQuery(event).q
  return { orders: await findOrders(typeof q === 'string' ? q.slice(0, 300) : '', { unit: unit.view(), actor }) } // not-policy: as long as the door takes, so a code brought in from another system fits
})
