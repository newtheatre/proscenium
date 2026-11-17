// The webhooks (C-49), with the events one may be sent: every declared event not marked internal.
import { defineRoute } from '#kit'
import { deliverableEvents } from '../../../webhooks/deliver'
import { listWebhooks } from '../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'default' }, async () => ({
  webhooks: await listWebhooks(),
  events: deliverableEvents(),
}))
