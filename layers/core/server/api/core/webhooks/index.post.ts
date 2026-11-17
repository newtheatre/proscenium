// Adds a webhook (C-49). For signed JSON the answer carries the secret, the one time it is shown.
import { defineRoute } from '#kit'
import { createWebhook, webhookInput } from '../../../webhooks/service'

export default defineRoute({ ability: 'core.webhook.manage', rateLimit: 'write', input: webhookInput }, async (_event, { input, unit, actor }) =>
  createWebhook(unit, input, actor.accountId ?? null))
