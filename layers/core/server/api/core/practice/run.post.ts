// PM-S4's "Run now" (O4): runs one of the scenario's scheduled tasks inside the person's store.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { runNow } from '../../../practice/service'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ task: z.string().max(120) }).strict(), // not-policy: a task name's length
}, async (_event, { input }) => runNow(input.task))
