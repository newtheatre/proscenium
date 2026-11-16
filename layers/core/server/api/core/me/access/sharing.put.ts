// Switch a purpose on or off (ID-39). Switching off stops further reads at once; copies already on
// a booking stay with the booking.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setSharing } from '../../../../identity/access-scheme'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ purpose: z.string().max(80), on: z.boolean() }).strict(), // not-policy: a purpose id is short
}, async (_event, { input, unit, actor }) => {
  await setSharing(unit, actor, actor.accountId!, input.purpose, input.on)
  return { ok: true }
})
