// A new secret for a signed JSON webhook (C-51), shown once; the old one stops working at once.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { rotateSecret } from '../../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) =>
  rotateSecret(unit, getRouterParam(event, 'id') ?? ''))
