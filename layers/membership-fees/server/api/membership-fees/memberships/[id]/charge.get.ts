// A membership's fee, for its console page (tab 5, "A membership", Payment): the charge, what has been
// refunded, and what the reader may do with it. Null when the membership was never charged.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { chargeOf } from '../../../../charges'

export default defineRoute({ ability: 'membership-fees.charge.view', rateLimit: 'default' }, async (event, { actor }) => {
  const charge = await chargeOf(getRouterParam(event, 'id')!)
  if (!charge) return { charge: null, canWaive: false, canRefund: false }
  return {
    charge: { id: charge.id, state: charge.state, amountMinor: charge.amount_minor, refundedMinor: charge.refunded_minor, currency: charge.currency, paidAt: charge.paid_at },
    canWaive: charge.state === 'open' && (await can(actor, 'membership-fees.charge.waive', ['membership-fees.charge', charge.id])).allowed,
    canRefund: ['paid', 'part-refunded'].includes(charge.state) && (await can(actor, 'membership-fees.refund.request', ['membership-fees.charge', charge.id])).allowed,
  }
})
