// Use a recovery code (ID-08). It opens a session good only for enrolling a new passkey, and tells
// every verified address of the account.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { useRecoveryCode } from '../../../identity/recovery'

export default defineRoute({ practice: 'refuse',
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ address: z.email().max(254), code: z.string().trim().min(6).max(40) }), // not-policy: the longest address; a recovery code with its dashes
}, async (event, { input, unit }) => useRecoveryCode(unit, event, input))
