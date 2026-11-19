// A booking taken for somebody at the desk or by phone, reserved to pay later (BO-34): the basket
// is written in a unit of its own, then reserved under the buyer's own rules in the request's unit.
import { z } from 'zod'
import { createUnit, defineRoute } from '#kit'
import { prepareDeskReservation, reserveForBuyer } from '../../../desk'
import { fromRequest } from '../../../links'

export default defineRoute({
  // Selling is asked of the performance named, inside.
  ability: 'box-office.order.view',
  rateLimit: 'write',
  idempotent: true,
  // The box office panel's own input, as it gives the till; checked inside.
  input: z.object({
    sale: z.unknown(),
    expectedTotalMinor: z.number().int().min(0),
    accountId: z.string().min(1).max(64).optional(), // not-policy: shape bound
    email: z.email().max(254).optional(), // not-policy: the longest address
  }).strict().refine(i => !(i.accountId && i.email), { message: 'A reservation goes to an address or a person, not both.' }),
}, async (event, { input, unit }) => {
  await fromRequest(event)
  const basket = createUnit()
  const prepared = await prepareDeskReservation(basket.view(), input)
  await basket.commit()
  return reserveForBuyer(unit.view(), prepared)
})
