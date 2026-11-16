// Sends the email deliveries notify() queued (C-29). Retries come back through this job, delayed.
import { defineJob } from '#kit'
import { sendDeliveries } from '../notifications/deliver'

export default defineJob<{ deliveryIds: string[] }>(async ({ deliveryIds }, unit) => {
  await sendDeliveries(deliveryIds, unit)
})
