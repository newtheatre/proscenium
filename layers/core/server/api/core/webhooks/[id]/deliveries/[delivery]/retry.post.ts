// Tries a failed delivery again (C-51).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { retryDelivery } from '../../../../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) => {
  await retryDelivery(unit, getRouterParam(event, 'id') ?? '', getRouterParam(event, 'delivery') ?? '')
  return { ok: true }
})
