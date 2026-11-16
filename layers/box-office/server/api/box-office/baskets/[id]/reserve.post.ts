// Reserve (R-1, R-7): the basket's seats are kept and paid for at the desk. A buyer who is not
// signed in gives an address, and is sent a link to prove it when the theatre asks for that.
import { z } from 'zod'
import { getHeader, getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { relyingParty } from '#modules/core'
import { requestReservation } from '../../../../reservations'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  protect: 'turnstile',
  input: z.object({
    expectedTotalMinor: z.number().int().min(0),
    email: z.string().trim().email().max(254).optional(), // not-policy: the longest address the mail standards allow
    name: z.string().trim().min(1).max(120).optional(), // not-policy: shape bound
  }).strict(),
}, (event, { input, unit }) => requestReservation(unit.view(), relyingParty(event).origin, {
  orderId: getRouterParam(event, 'id')!,
  token: getHeader(event, 'x-basket-token') ?? '',
  ...input,
}))
