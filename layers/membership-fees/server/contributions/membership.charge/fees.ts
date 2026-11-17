// The fee collector Membership asks for through membership.charge (rules S5, P1, P2).
import type { MembershipCharge } from '#modules/membership'
import { chargeOf, openCharge, voidCharge } from '../../charges'
import { priceInForce } from '../../prices'

export default {
  async priceFor(schemeId, lengthOptionId, kind, on) {
    const price = await priceInForce(schemeId, lengthOptionId, kind, on)
    return price && { priceId: price.priceId, amountMinor: price.amountMinor, currency: price.currency }
  },
  open: openCharge,
  void: voidCharge,
  async status(membershipId) {
    const charge = await chargeOf(membershipId)
    return charge && { id: charge.id, state: charge.state, amountMinor: charge.amount_minor, refundedMinor: charge.refunded_minor, currency: charge.currency }
  },
} satisfies MembershipCharge
