// The ways to pay on offer on a channel, from active provider accounts whose provider is ready.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { methodsFor } from '../../providers'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'default',
  input: z.object({ channel: z.enum(['desk', 'online']).default('desk') }),
}, async (_event, { input }) => ({ methods: await methodsFor(input.channel) }))
