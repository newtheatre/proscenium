// Sends the webhook deliveries the deliverable listener queued (C-50). Retries come back through this
// job, delayed; the five-minute sweep takes back any a dead job left sending.
import { defineJob } from '#kit'
import { sendWebhookDeliveries } from '../webhooks/deliver'

export default defineJob<{ deliveryIds: string[] }>(async ({ deliveryIds }, unit) => {
  await sendWebhookDeliveries(deliveryIds, unit)
})
