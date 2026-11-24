// Sign out everywhere else: every session but this one ends (ID-13).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { sessionOf } from '../../../../identity/guards'
import { endSessionsOf } from '../../../../identity/sessions'

export default defineRoute({ practice: 'refuse', ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) => {
  const session = await sessionOf(event)
  endSessionsOf(unit, session.accountId, 'ended_by_person', session.id)
  return { kept: session.id }
})
