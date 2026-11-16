// Confirm my access details are still right, which resets the review date (ID-44).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { confirmStillRight } from '../../../../identity/access-scheme'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (_event, { unit, actor }) => {
  await confirmStillRight(unit, actor.accountId!)
  return { ok: true }
})
