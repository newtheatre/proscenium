// Leave the access scheme (ID-44): the application and the sharing choices are deleted at once.
// Bookings already made keep what they were given; the screen says so before this is sent.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { withdraw } from '../../../identity/access-scheme'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (_event, { unit, actor }) => {
  await withdraw(unit, actor.accountId!)
  return { ok: true }
})
