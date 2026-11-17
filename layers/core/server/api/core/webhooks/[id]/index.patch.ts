// Changes a webhook's name, address, format or events. A move to JSON answers with its new secret.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateWebhook, webhookPatch } from '../../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'write', input: webhookPatch }, async (event, { input, unit }) =>
  updateWebhook(unit, getRouterParam(event, 'id') ?? '', input))
