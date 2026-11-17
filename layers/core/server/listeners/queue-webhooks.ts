// Every event not marked internal (on: 'deliverable'): one queued delivery for each active webhook
// that names it. It runs after the event's own batch, in a unit of its own (group 6).
import { defineListener } from '#kit'
import { queueWebhooks } from '../webhooks/deliver'

export default defineListener(async (event, unit) => {
  await queueWebhooks(event, unit)
})
