// Start confirming it is me with a passkey, before a sensitive action (ID-28).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../../identity/guards'
import { authenticationOptions } from '../../../../identity/passkeys'

export default defineRoute({ practice: 'refuse', ability: 'signed-in', rateLimit: 'sign-in', input: z.object({}) }, async (event, { unit }) => {
  const session = await sessionOf(event)
  return authenticationOptions(unit, event, { purpose: 'reassert', accountId: session.accountId })
})
