// A promo code tried on the Choose tickets page or in the till (BO-17): what each ticket costs with
// it, so the saving shows before anything is held; or which of unknown, not yet, expired, used up or
// not for these tickets it is. Priced through Payments' pricing, each ticket as if it were alone.
// Guessing is slowed by the public form's rate limit.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { availability } from '../../../../../availability'
import { priceTickets } from '../../../../../promotions'

export default defineRoute({
  public: true,
  rateLimit: 'public-form',
  input: z.object({ code: z.string().trim().min(1).max(40) }), // not-policy: longer than any code
}, async (event, { input }) => {
  const performanceId = getRouterParam(event, 'id')!
  const found = await availability(performanceId)
  const each = found.bands.flatMap(b => b.prices.filter(p => p.amountMinor > 0).map(p => ({ bandId: b.bandId, ticketTypeId: p.ticketTypeId, amountMinor: p.amountMinor })))
  const { discounts, priced } = await priceTickets(performanceId, each, 'online', input.code, true)
  const code = priced.applied.find(a => a.code)!
  const prices = each.flatMap((p, i) => discounts[i]! > 0 ? [{ bandId: p.bandId, ticketTypeId: p.ticketTypeId, amountMinor: p.amountMinor - discounts[i]! }] : [])
  return { code: code.code!, label: code.label, effect: code.effect, value: code.value, maxPerOrder: code.maxPerSale, prices }
})
