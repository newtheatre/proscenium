// A bar sale (S4): its lines with any reversals under each, its age checks (never a description), and
// whether the viewer may refund it.
import { getRouterParam } from 'nuxt/server'
import { can, defineRoute, refuse } from '#kit'
import { checksForSale } from '../../../../age-checks'
import { saleByReference } from '../../../../refunds'

export default defineRoute({ ability: 'bar.sale.view', rateLimit: 'default' }, async (event, { actor }) => {
  const sale = await saleByReference(getRouterParam(event, 'reference', { decode: true }) ?? '') ?? refuse('core.not-found', 'There is no such bar sale.', { status: 404 })
  return { sale, ageChecks: await checksForSale(sale.id), canRefund: (await can(actor, 'bar.sale.refund')).allowed }
})
