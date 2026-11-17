// The Fees page (tab 5, scheme "Fee"): every scheme with its lengths, the price in force today for
// joining and for renewing each length, and each scheme's price history.
import { all, defineRoute, today } from '#kit'
import { priceInForce, pricesOf } from '../../../prices'

export default defineRoute({ ability: 'membership-fees.price.manage', rateLimit: 'default' }, async () => {
  const day = await today()
  const schemes = await all<{ id: string, name: string, state: string, requiresPayment: number, lengthRule: string }>(
    "SELECT id, name, state, requires_payment AS requiresPayment, length_rule AS lengthRule FROM membership_schemes WHERE state <> 'archived' ORDER BY position, name",
  )
  const options = await all<{ id: string, schemeId: string, name: string }>(
    "SELECT id, scheme_id AS schemeId, name FROM membership_length_options WHERE state = 'offered' ORDER BY position, id",
  )
  return {
    today: day,
    schemes: await Promise.all(schemes.map(async (s) => {
      const lengths = s.lengthRule === 'indefinite' ? [{ id: null, name: null }] : options.filter(o => o.schemeId === s.id).map(o => ({ id: o.id as string | null, name: o.name as string | null }))
      return {
        id: s.id, name: s.name, state: s.state, requiresPayment: !!s.requiresPayment,
        lengths: await Promise.all(lengths.map(async l => ({
          ...l,
          join: (await priceInForce(s.id, l.id, 'join', day))?.amountMinor ?? null,
          renew: (await priceInForce(s.id, l.id, 'renew', day))?.amountMinor ?? null,
        }))),
        history: await pricesOf(s.id),
      }
    })),
  }
})
