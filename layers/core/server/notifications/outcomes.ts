// What Cloudflare reports after it accepted a message (part 3, "Two late moves"; proof P-COM-3).
// The event names the message by the id send() returned, which the delivery kept as provider_ref.
// A hard bounce or a complaint puts the address on core's own suppression list, whether or not the
// message was one core recorded: Cloudflare did not stop a second send to a hard-bounced address
// within minutes in the proof, so the list is what stops repeats. Bounced, Complained and Failed are
// final; a repeat or a late report changes nothing. Nothing here logs the recipient or the subject.
import { createUnit, first, nowMs } from '#kit'
import type { UnitView } from '#kit'
import type { EmailEvent, EmailEventOutcome, SetAside } from '#kit/email-events'
import { addressHash } from './suppression'
import { declaredType } from './notify'

const PREFIX = 'cf.email.sending.message.'
/** How long a set-aside row is kept: fixed, not a setting (core part 2). */
interface Match { id: string, state: string, notification_id: string, account_id: string | null, type_key: string }

async function suppress(unit: UnitView, recipient: unknown, reason: 'hard_bounce' | 'complaint'): Promise<void> {
  if (typeof recipient !== 'string' || !recipient.includes('@')) return
  const hash = await addressHash(recipient)
  const existing = await first<{ lifted_at: number | null }>('SELECT lifted_at FROM core_email_suppressions WHERE address_hash = ?', hash)
  if (existing && existing.lifted_at === null) return
  unit.add({
    sql: 'INSERT INTO core_email_suppressions (address_hash, reason, created_at) VALUES (?, ?, ?) ON CONFLICT (address_hash) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at, lifted_at = NULL, lifted_by = NULL',
    params: [hash, reason, nowMs()],
  })
  unit.announce('core.address.suppressed', { reason })
}

export async function recordEmailOutcome(event: EmailEvent, unit: UnitView, _delivery: { attempts: number }): Promise<EmailEventOutcome> {
  const kind = event.type.startsWith(PREFIX) ? event.type.slice(PREFIX.length) : event.type
  const payload = event.payload as EmailEvent['payload'] & { recipient?: unknown, bounce?: { type?: unknown } }
  const hard = kind === 'bounced' && payload.bounce?.type === 'hard'
  // Delivered, deferred and soft bounces change nothing core keeps.
  if (!(hard || kind === 'complained' || kind === 'failed' || kind === 'rejected')) return 'done'

  if (hard) await suppress(unit, payload.recipient, 'hard_bounce')
  if (kind === 'complained') await suppress(unit, payload.recipient, 'complaint')

  const match = await first<Match>(`SELECT d.id, d.state, d.notification_id, n.account_id, n.type_key
      FROM core_notification_deliveries d JOIN core_notifications n ON n.id = d.notification_id
     WHERE d.provider_ref = ? AND d.channel = 'email'`, payload.messageId)
  if (!match) {
    // Not recorded yet, or sent outside the pipeline. The suppression is committed either way, and
    // the kit tries again until the queue sets the event aside (core part 4): never dropped silently.
    return 'unmatched'
  }
  if (match.state !== 'sent') return 'done'

  const to = hard ? 'bounced' : kind === 'complained' ? 'complained' : 'failed'
  unit.add({
    sql: 'UPDATE core_notification_deliveries SET state = ?, reason = ?, last_error = ? WHERE id = ? AND state = \'sent\'',
    params: [to, hard || kind === 'complained' ? 'suppressed_address' : null, to === 'failed' ? `provider_${kind}` : null, match.id],
  })
  const record = { notificationId: match.notification_id, accountId: match.account_id }
  if (to === 'bounced') unit.announce('core.delivery.bounced', record)
  else if (to === 'complained') unit.announce('core.delivery.complained', record)
  else if (declaredType(match.type_key)?.type.category === 'transactional')
    unit.announce('core.delivery.failed', { notificationId: match.notification_id, typeKey: match.type_key, channel: 'email' })
  return 'done'
}

/**
 * An event the queue is giving up on, kept for the health screen: its queue message id, one of the
 * six known types or null, and why. Nothing from the message itself. Rows older than 30 days go in
 * the same unit, as the table's fixed retention says.
 */
export async function recordSetAside(info: SetAside): Promise<void> {
  const at = nowMs()
  const unit = createUnit()
  unit.add({ sql: 'INSERT INTO core_email_events_set_aside (queue_message_id, event_type, reason, set_aside_at) VALUES (?, ?, ?, ?) ON CONFLICT (queue_message_id) DO NOTHING', params: [info.queueMessageId, info.type, info.reason, at] })
  await unit.commit()
}
