// Pay (BO-10, BO-12): the basket goes on to payment, its seats kept for the payment window. An
// order with nothing to pay is confirmed here and now, and its tickets come back in the answer.
// No bot check here: holding the seats took one, and only that basket's secret token opens this.
import { z } from 'zod'
import { getHeader, getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { startCheckout } from '../../../../checkout'
import { fromRequest } from '../../../../links'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  input: z.object({
    expectedTotalMinor: z.number().int().min(0),
    email: z.string().trim().email().max(254).optional(), // not-policy: the longest address the mail standards allow
    name: z.string().trim().min(1).max(120).optional(), // not-policy: shape bound
    // That everyone using the tickets is old enough, for a production only for people over an age.
    ageConfirmed: z.boolean().optional(),
  }).strict(),
}, async (event, { input, unit }) => {
  await fromRequest(event)
  return startCheckout(unit.view(), { orderId: getRouterParam(event, 'id')!, token: getHeader(event, 'x-basket-token') ?? '', ...input })
})
