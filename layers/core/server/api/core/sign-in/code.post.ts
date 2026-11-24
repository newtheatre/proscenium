// Use the code from a sign-in email, in the browser that asked for it.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { useCode } from '../../../identity/email-sign-in'

export default defineRoute({ practice: 'refuse',
  public: true,
  rateLimit: 'sign-in-network',
  input: z.object({ address: z.email().max(254), code: z.string().trim().regex(/^\d{6}$/) }), // not-policy: the longest address; codes are six digits
}, async (event, { input, unit }) => {
  const done = await useCode(unit, event, input)
  return { next: done.next ?? '/', offerPasskey: done.offerPasskey, welcome: done.welcome }
})
