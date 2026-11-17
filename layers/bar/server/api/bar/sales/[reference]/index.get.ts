// A bar sale (S4): its lines with any reversals under each, and whether the viewer may refund it.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { saleByReference } from '../../../../refunds'

export default defineRoute({ ability: 'bar.sale.view', rateLimit: 'default' }, async (event, { actor }) => {
  const sale = await saleByReference(getRouterParam(event, 'reference') ?? '') ?? refuse('core.not-found', 'There is no such bar sale.', { status: 404 })
  return { sale, canRefund: (await can(actor, 'bar.sale.refund')).allowed }
})
