// Asks the provider to stop a payment waiting on a card reader.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { cancelAttempt } from '../../../../start'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async event => cancelAttempt(getRouterParam(event, 'id', { decode: true }) ?? ''))
