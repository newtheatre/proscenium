// Cancels a desk payment, releasing what was prepared for it. A payment still waiting on the reader
// may be given up on: the reader is asked to stop, and money it takes after all is refunded.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { cancelIntent } from '../../../../intents'
import { stopWaiting } from '../../../../start'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { unit }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  const { waiting } = await cancelIntent(unit.view(), id)
  if (waiting.length) unit.afterCommit(() => stopWaiting(waiting))
  return { cancelled: true, waiting }
})
