// Use the link from a sign-in email. The landing page posts the token only on a press, because
// mail scanners open links in a real browser.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { useLink } from '../../../identity/email-sign-in'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in-network',
  input: z.object({ token: z.string().min(20).max(100) }), // not-policy: a link token is 43 characters
}, async (event, { input, unit }) => {
  const done = await useLink(unit, event, input.token)
  return { next: done.next ?? '/', offerPasskey: done.offerPasskey, welcome: done.welcome, ...(done.invitation ? { invitation: done.invitation } : {}) }
})
