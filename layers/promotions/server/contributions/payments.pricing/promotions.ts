// Promotions prices every sale (payments.pricing): the selling modules hand over their items and
// write the savings that come back on their own lines.
import type { Pricing } from '#modules/payments'
import { anyAutomatic, describeRedemptions, moveRedemptions, priceWithPromotions, redeemPromotions } from '../../promotions'

export default {
  price: priceWithPromotions,
  automatic: anyAutomatic,
  redeem: redeemPromotions,
  move: moveRedemptions,
  describe: describeRedemptions,
} satisfies Pricing
