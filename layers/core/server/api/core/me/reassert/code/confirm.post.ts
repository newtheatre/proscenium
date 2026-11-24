// Confirm it is me with the emailed code. The session becomes fresh, never strong (ID-28).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../../../identity/guards'
import { confirmWithCode } from '../../../../../identity/reassert'

export default defineRoute({ practice: 'refuse',
  ability: 'signed-in',
  rateLimit: 'sign-in',
  input: z.object({ code: z.string().trim().regex(/^\d{4,10}$/) }).strict(), // not-policy: a short run of digits
}, async (event, { input, unit }) => {
  return confirmWithCode(unit, await sessionOf(event), input.code)
})
