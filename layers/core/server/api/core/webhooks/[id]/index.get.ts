// One webhook, with the events it may be sent.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { deliverableEvents } from '../../../../webhooks/deliver'
import { getWebhook } from '../../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'default' }, async event => ({
  webhook: await getWebhook(getRouterParam(event, 'id', { decode: true }) ?? ''),
  events: deliverableEvents(),
}))
