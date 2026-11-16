// Start a passkey sign-in. No address: the browser offers the passkeys it holds for this site (ID-02).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { authenticationOptions } from '../../../../identity/passkeys'

export default defineRoute({ public: true, rateLimit: 'sign-in', input: z.object({}) }, async (event, { unit }) => {
  return authenticationOptions(unit, event, { purpose: 'sign_in', accountId: null })
})
