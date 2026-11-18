// A promo code tried on the Choose tickets page (BO-17): what it takes off each ticket it applies
// to, so the saving shows before anything is held; or which of unknown, not yet, expired, used up or
// not for this performance it is. Guessing is slowed by the public form's rate limit.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getPerformance } from '#modules/core'
import { availability } from '../../../../../availability'
import { appliesTo, discountOf, judgeCode, keptOff } from '../../../../../promo-codes'

export default defineRoute({
  public: true,
  rateLimit: 'public-form',
  input: z.object({ code: z.string().trim().min(1).max(40) }), // not-policy: longer than any code
}, async (event, { input }) => {
  const performanceId = getRouterParam(event, 'id')!
  const code = await judgeCode(input.code, performanceId)
  const performance = await getPerformance(performanceId)
  const found = await availability(performanceId)
  const kept = await keptOff(code)
  const prices = found.bands.flatMap(b => b.prices
    .filter(p => p.amountMinor > 0 && appliesTo(code, { productionId: performance.productionId, performanceId, ticketTypeId: p.ticketTypeId, bandId: b.bandId }, kept))
    .map(p => ({ bandId: b.bandId, ticketTypeId: p.ticketTypeId, amountMinor: p.amountMinor - discountOf(code, p.amountMinor) })))
  return { code: code.code, effect: code.effect, value: code.value, maxPerOrder: code.maxPerOrder, prices }
})
