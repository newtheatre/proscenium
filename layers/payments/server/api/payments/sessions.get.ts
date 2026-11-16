// Every till session, newest first, expected against counted.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listSessions } from '../../sessions'

export default defineRoute({
  ability: 'payments.session.view',
  rateLimit: 'default',
  input: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }), // not-policy: a page of sessions
}, async (_event, { input }) => ({ sessions: await listSessions(input.limit) }))
