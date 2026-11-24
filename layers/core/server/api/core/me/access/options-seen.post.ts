// None of the entries added to the access scheme's list since I applied helps me: My account stops
// pointing them out until more arrive.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { markOptionsSeen } from '../../../../identity/access-scheme'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (_event, { unit, actor }) => {
  await markOptionsSeen(unit, actor.accountId!)
  return { ok: true }
})
