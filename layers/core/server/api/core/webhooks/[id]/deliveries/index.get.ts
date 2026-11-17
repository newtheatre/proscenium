// The delivery log for one webhook (C-51), newest first.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { webhookDeliveries } from '../../../../../webhooks/service'

export default defineRoute({
  ability: 'core.webhook.manage',
  rateLimit: 'default',
  input: z.object({ page: z.coerce.number().int().min(1).default(1), size: z.coerce.number().int().min(1).max(100).default(50) }), // not-policy: the log's page sizes
}, async (event, { input }) => webhookDeliveries(getRouterParam(event, 'id') ?? '', input))
