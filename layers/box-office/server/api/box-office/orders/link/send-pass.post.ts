// Send a pass bought with a booking to someone else (Matt, 18 November), from the booking's link
// with no sign-in, or as its signed-in owner by its id: they become its holder and are emailed its code.
import { z } from 'zod'
import { defineRoute, idSchema } from '#kit'
import { orderKeyOf } from '../../../../order-key'
import { sendPassFromLink } from '../../../../reservations'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ passId: idSchema('pass'), email: z.email().max(254) }).strict(), // not-policy: the longest address
}, (event, { actor, input, unit }) => sendPassFromLink(unit.view(), orderKeyOf(event, actor), input.passId, input.email))
