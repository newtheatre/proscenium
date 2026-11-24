// Deletes a webhook and its delivery log.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deleteWebhook } from '../../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) => {
  await deleteWebhook(unit, getRouterParam(event, 'id', { decode: true }) ?? '')
  return { ok: true }
})
