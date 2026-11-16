// Use an address verification link (ID-12). The link proves the mailbox, so no session is needed.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { verifyAddress } from '../../../../identity/my-addresses'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ token: z.string().min(20).max(100) }), // not-policy: a link token is 43 characters
}, async (_event, { input, unit }) => {
  await verifyAddress(unit, input.token)
  return { verified: true }
})
