// The address a provider sign-in is waiting to have proven by emailed code (MS3), so the sign-in
// page can send that code. Only this browser's own sealed cookie says; nothing is looked up.
import { defineRoute } from '#kit'
import { pendingLink } from '../../../identity/oidc'

export default defineRoute({ practice: 'refuse',
  public: true,
  rateLimit: 'sign-in-network',
}, async (event) => {
  const pending = await pendingLink(event)
  return { address: pending?.address ?? null, provider: pending?.provider ?? null }
})
