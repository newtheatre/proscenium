// "Send a test" (C-49): a marked test event, sent now and not logged, and the receiver's status.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { testWebhook } from '../../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'write', input: z.object({}) }, async event =>
  testWebhook(getRouterParam(event, 'id') ?? ''))
