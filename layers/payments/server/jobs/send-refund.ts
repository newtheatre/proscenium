// Sends one approved refund through its provider. The idempotency key makes a retry safe; while the
// provider says pending, the job fails so the queue asks again.
import { defineJob } from '#kit'
import { sendRefund } from '../refunds'

export default defineJob<{ refundId: string }>(async (payload) => {
  const answer = await sendRefund(payload.refundId)
  if (answer?.state === 'pending') throw new Error(`refund ${payload.refundId} is still pending with its provider`)
})
