// Ask for a sign-in link and code (ID-01, ID-10). The answer is the same whether or not an account
// exists, and the same when a limit is reached; only a managed domain is sent to its provider.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requestEmailSignIn } from '../../../identity/email-sign-in'
import { requireChallengeSecret } from '../../../identity/challenge'
import { safeNext } from '../../../identity/web'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in-network',
  protect: 'turnstile',
  input: z.object({ address: z.email().max(254), next: z.string().max(512).optional() }), // not-policy: the longest address and return path
}, async (event, { input, unit }) => {
  await requireChallengeSecret()
  return requestEmailSignIn(unit, event, { address: input.address, next: safeNext(input.next) })
})
