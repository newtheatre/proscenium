// Check a recovery code typed back after it was shown, without spending it (ID-03).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../../identity/guards'
import { isRecoveryCode } from '../../../../identity/passkeys'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'sign-in',
  input: z.object({ code: z.string().max(40) }), // not-policy: a recovery code is eleven characters
}, async (event, { input }) => {
  const session = await sessionOf(event)
  return { matches: await isRecoveryCode(session.accountId, input.code) }
})
