// Confirm it is me with a code from my authenticator app (ID-28). The session becomes fresh, and
// strong when `core.sign-in.authenticator-is-strong` allows (an email or Google sign-in plus the app).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../../identity/guards'
import { confirmWithAuthenticator } from '../../../../identity/authenticator'

export default defineRoute({ practice: 'refuse',
  ability: 'signed-in',
  rateLimit: 'sign-in',
  input: z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict(), // not-policy: an app shows six digits
}, async (event, { input, unit }) => {
  return confirmWithAuthenticator(unit, await sessionOf(event), input.code)
})
