// Every five minutes (part 3): a send job that died leaves its delivery Sending past the claim's
// lease, which goes back to Retrying; a delivery left Queued or Retrying past its time, because its
// queue message was lost, is queued again; and a notification whose every delivery is finished
// loses its payload, so the log says what was sent without holding what it said. Sealed variables
// never outlive seven days, sent or not. Email outcomes set aside go after the table's fixed retention.
// Webhook deliveries are swept the same way (group 6).
import { all, defineTask, nowMs, retentionSeconds, useSetting } from '#kit'
import { emailEventsSetAside } from '../db/domain'

export default defineTask(async (unit) => {
  const at = nowMs()
  const stuckAfter = await useSetting('core.delivery.stuck-after') as number * 1000 // not-policy: seconds to milliseconds
  const limit = await useSetting('core.units.set-rows-limit') as number

  unit.add({ sql: 'UPDATE core_notification_deliveries SET state = \'retrying\', last_error = \'stuck\', next_attempt_at = ? WHERE state = \'sending\' AND next_attempt_at < ?', params: [at, at] })

  const due = await all<{ id: string }>(`SELECT id FROM core_notification_deliveries
     WHERE channel = 'email' AND ((state = 'queued' AND created_at < ?) OR (state = 'retrying' AND next_attempt_at < ?) OR (state = 'sending' AND next_attempt_at < ?))
     ORDER BY created_at LIMIT ?`, at - stuckAfter, at - stuckAfter, at, limit)
  if (due.length) unit.enqueue('core.send-notifications', { deliveryIds: due.map(r => r.id) })

  unit.add({
    sql: `UPDATE core_notifications SET payload = NULL, address = NULL WHERE payload IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM core_notification_deliveries d WHERE d.notification_id = core_notifications.id AND d.state IN ('queued', 'held', 'sending', 'retrying'))`,
    params: [],
  })
  unit.add({ sql: 'UPDATE core_notifications SET sealed_variables = NULL WHERE sealed_variables IS NOT NULL AND created_at < ?', params: [at - 7 * 86_400_000] }) // not-policy: the specification fixes seven days
  // Webhook deliveries the same way: a dead send goes back to retrying, and anything due is queued again.
  // A paused webhook's deliveries wait where they are until it resumes.
  unit.add({ sql: 'UPDATE core_webhook_deliveries SET state = \'retrying\', last_error = \'stuck\', next_attempt_at = ? WHERE state = \'sending\' AND next_attempt_at < ?', params: [at, at] })
  const hooks = await all<{ id: string }>(`SELECT d.id FROM core_webhook_deliveries d JOIN core_webhooks w ON w.id = d.webhook_id
     WHERE w.state = 'active' AND ((d.state = 'queued' AND d.created_at < ?) OR (d.state = 'retrying' AND d.next_attempt_at < ?) OR (d.state = 'sending' AND d.next_attempt_at < ?))
     ORDER BY d.created_at LIMIT ?`, at - stuckAfter, at, at, limit)
  if (hooks.length) unit.enqueue('core.send-webhook', { deliveryIds: hooks.map(r => r.id) })

  const setAsideKept = await retentionSeconds(emailEventsSetAside)
  if (setAsideKept !== null) unit.add({ sql: 'DELETE FROM core_email_events_set_aside WHERE set_aside_at < ?', params: [at - setAsideKept * 1000] }) // not-policy: seconds to milliseconds
})
