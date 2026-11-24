// Start signing in with an outside provider: a redirect there (ID-04). Only while that provider is on;
// an unknown or switched-off one is a page that is not here.
import { getRouterParam, setResponseHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { startProvider } from '../../../identity/oidc'
import { providerById } from '../../../identity/providers'
import { safeNext } from '../../../identity/web'

export default defineRoute({ practice: 'refuse',
  public: true,
  rateLimit: 'sign-in-network',
  input: z.object({ next: z.string().max(512).optional(), login_hint: z.email().max(254).optional() }), // not-policy: a return path and an address are short
}, async (event, { input }) => {
  const provider = providerById(getRouterParam(event, 'provider') ?? '')
  const to = await startProvider(event, provider, { next: safeNext(input.next), loginHint: input.login_hint })
  setResponseStatus(event, 302) // not-policy: HTTP Found
  setResponseHeader(event, 'location', to)
  return ''
})
