// Sign out of this browser.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../identity/guards'
import { endCurrentSession } from '../../identity/sessions'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) => {
  const session = await sessionOf(event)
  endCurrentSession(unit, event, session.id)
  return { signedOut: true }
})
