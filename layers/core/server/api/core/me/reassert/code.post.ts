// Send a code to confirm it is me, for a basic session on an account with no passkey (ID-28).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../../identity/guards'
import { sendCode } from '../../../../identity/reassert'

export default defineRoute({ practice: 'refuse', ability: 'signed-in', rateLimit: 'sign-in', input: z.object({}) }, async (event, { unit }) => {
  return sendCode(unit, await sessionOf(event))
})
