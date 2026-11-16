// Asks the provider again, with the same key, for a payment whose start had no answer.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { siteOrigin } from '../../../../origin'
import { retryStart } from '../../../../start'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async event => retryStart(getRouterParam(event, 'id') ?? '', siteOrigin(event)))
