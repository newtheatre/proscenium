// Use the link from a sign-in email. The landing page posts the token on a press, because mail
// scanners open links in a real browser. As it opens it asks once with `here`, which signs in only
// the browser that asked for the link and otherwise spends nothing and says to wait for the press.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { useLink, useLinkHere } from '../../../identity/email-sign-in'

export default defineRoute({ practice: 'refuse',
  public: true,
  rateLimit: 'sign-in-network',
  input: z.object({ token: z.string().min(20).max(100), here: z.boolean().optional() }), // not-policy: a link token is 43 characters
}, async (event, { input, unit }) => {
  const done = input.here ? await useLinkHere(unit, event, input.token) : await useLink(unit, event, input.token)
  if (!done) return { press: true as const }
  return { next: done.next ?? '/', offerPasskey: done.offerPasskey, welcome: done.welcome, ...(done.invitation ? { invitation: done.invitation } : {}) }
})
