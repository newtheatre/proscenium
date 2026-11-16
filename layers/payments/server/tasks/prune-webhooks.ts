// Deletes webhook receipts older than payments.retention.webhooks. Only ids and types were kept.
import { defineTask, nowMs, useSetting } from '#kit'

const SECOND = 1000 // not-policy: milliseconds in a second

export default defineTask(async (unit) => {
  const keep = await useSetting('payments.retention.webhooks') as number
  unit.add({ sql: 'DELETE FROM payments_webhook_events WHERE received_at < ?', params: [nowMs() - keep * SECOND] })
})
