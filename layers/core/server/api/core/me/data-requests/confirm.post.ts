// Use the emailed link that confirms an erasure (ID-16). It proves the mailbox, so no session is needed.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { confirmErasure } from '../../../../identity/data-requests'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ token: z.string().min(20).max(100) }), // not-policy: a link token is 43 characters
}, async (_event, { input, unit }) => confirmErasure(unit, input.token))
