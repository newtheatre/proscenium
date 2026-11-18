// Use the code from a sign-in email, in the browser that asked for it. The network address as a
// whole has the generous sign-in-network allowance, so people sharing one Wi-Fi do not lock each
// other out; the strict sign-in allowance is counted for this email address from this network.
import { z } from 'zod'
import { defineRoute, refuse, useContext } from '#kit'
import { countAgainstRate } from '#kit/ratelimit'
import { setResponseHeader } from 'h3'
import { useCode } from '../../../identity/email-sign-in'
import { normaliseAddress } from '../../../identity/accounts'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in-network',
  input: z.object({ address: z.email().max(254), code: z.string().trim().regex(/^\d{6}$/) }), // not-policy: the longest address; codes are six digits
}, async (event, { input, unit }) => {
  const rate = await countAgainstRate('sign-in', `code:${normaliseAddress(input.address)}|${useContext().address ?? 'unknown'}`)
  if (!rate.allowed) {
    setResponseHeader(event, 'Retry-After', rate.retryAfter)
    refuse('core.rate-limit.reached', 'Too many requests. Please slow down.', { status: 429, remedy: 'Wait a while, then try again.' })
  }
  const done = await useCode(unit, event, input)
  return { next: done.next ?? '/', offerPasskey: done.offerPasskey, welcome: done.welcome }
})
