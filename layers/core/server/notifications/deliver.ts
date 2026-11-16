// Sends queued email deliveries (C-29, part 3). Each delivery is claimed with a conditional write
// and committed before the send, so two copies of the job cannot both send it; its outcome is its
// own small unit too, so one delivery's failure never undoes another's success. The provider's
// message id is kept exactly as send() returns it, angle brackets included, because Cloudflare's
// bounce and complaint events carry that same string (proof P-COM-3).
import { all, createUnit, isRefusal, nowMs, useSetting } from '#kit'
import type { UnitView } from '#kit'
import { addressesFor } from '../identity/addresses'
import { brandTokens } from '../brand/theme'
import { DOMAIN_CODES, MailError, useMailer } from './mailer'
import { render } from './render'
import { sendingDomain, senderFor, theatreName } from './send'
import { declaredType } from './notify'
import { suppressedAddresses } from './suppression'

interface DueRow {
  id: string
  notification_id: string
  sender_key: string | null
  attempts: number
  type_key: string
  side: 'audience' | 'members'
  account_id: string | null
  address: string | null
  locale: string
  payload: string | null
}

/** Codes that are the recipient's, not a fault: the delivery fails at once and is not retried. */
const RECIPIENT_CODES = new Set(['E_RECIPIENT_SUPPRESSED', 'E_RECIPIENT_NOT_ALLOWED'])

async function senderByKey(key: string, domain: string) {
  const [row] = await all<{ display_name: string, local_part: string, reply_to: string | null }>(
    'SELECT display_name, local_part, reply_to FROM core_sender_identities WHERE key = ? AND state = \'active\'', key,
  )
  return row ? { key, name: row.display_name, email: `${row.local_part}@${domain}`, replyTo: row.reply_to ?? undefined } : undefined
}

async function settle(id: string, change: { state: 'sent' | 'retrying' | 'failed' | 'skipped', reason?: string, providerRef?: string, error?: string, nextAttemptAt?: number }) {
  const unit = createUnit()
  unit.add({
    sql: 'UPDATE core_notification_deliveries SET state = ?, reason = coalesce(?, reason), provider_ref = coalesce(?, provider_ref), last_error = ?, next_attempt_at = ?, sent_at = CASE WHEN ? = \'sent\' THEN ? ELSE sent_at END WHERE id = ? AND state = \'sending\'',
    params: [change.state, change.reason ?? null, change.providerRef ?? null, change.error ?? null, change.nextAttemptAt ?? null, change.state, nowMs(), id],
  })
  return unit
}

/**
 * Sends each of the given deliveries that is still due. Deliveries to retry are put back on the
 * queue through `unit`, the job's own unit, grouped by how long they wait.
 */
export async function sendDeliveries(deliveryIds: readonly string[], unit: UnitView): Promise<{ sent: number, retrying: number, failed: number, skipped: number }> {
  const counts = { sent: 0, retrying: 0, failed: 0, skipped: 0 }
  const due = await all<DueRow>(`SELECT d.id, d.notification_id, d.sender_key, d.attempts, n.type_key, n.side, n.account_id, n.address, n.locale, n.payload
      FROM core_notification_deliveries d JOIN core_notifications n ON n.id = d.notification_id
     WHERE d.id IN (SELECT value FROM json_each(?)) AND d.channel = 'email' AND d.state IN ('queued', 'retrying')`, JSON.stringify(deliveryIds))
  if (!due.length) return counts

  // No verified domain: leave every delivery as it is and let the job retry; the sweep re-queues it.
  const domain = await sendingDomain()
  const maxAttempts = await useSetting('core.notifications.max-attempts') as number
  const firstRetry = await useSetting('core.notifications.first-retry') as number
  const brand = await brandTokens()
  const theatre = await theatreName(domain)
  const footer = await useSetting('core.notifications.email-footer') as string | null
  // The address is read again at send time, so a person who changed theirs meanwhile is reached at the new one.
  const idsOn = (side: 'audience' | 'members') => due.filter(d => !d.address && d.account_id && d.side === side).map(d => d.account_id!)
  const sides = { audience: await addressesFor(idsOn('audience'), 'audience'), members: await addressesFor(idsOn('members'), 'members') }
  const addressOf = (row: DueRow) => row.address ?? (row.account_id ? sides[row.side].get(row.account_id) ?? null : null)
  const suppressed = await suppressedAddresses(due.map(addressOf).filter((a): a is string => !!a))
  const retries = new Map<number, string[]>()

  for (const row of due) {
    // Claim it: only one copy of this job may move it to sending.
    const claim = createUnit()
    claim.add({ sql: 'UPDATE core_notification_deliveries SET state = \'sending\', attempts = attempts + 1 WHERE id = ? AND state IN (\'queued\', \'retrying\')', params: [row.id] }).expect(1)
    try {
      await claim.commit()
    }
    catch (error) {
      if (isRefusal(error)) continue
      throw error
    }
    const attempt = row.attempts + 1
    const found = declaredType(row.type_key)
    const address = addressOf(row)
    if (!found || !address || suppressed.has(address.toLowerCase()) || row.payload === null) {
      const reason = !found ? 'unknown_type' : !address ? 'no_address' : row.payload === null ? 'erased' : 'suppressed_address'
      await (await settle(row.id, { state: 'skipped', reason })).commit()
      counts.skipped++
      continue
    }
    const { type } = found
    const wording = type.wording[row.locale] ?? type.wording['en-GB']!
    const message = render(wording, { values: JSON.parse(row.payload), kinds: type.variables, accent: brand.light.link, theatre, footer })
    const sender = (row.sender_key ? await senderByKey(row.sender_key, domain) : undefined) ?? await senderFor(type.topic ?? 'transactional', domain)
    try {
      const result = await useMailer()({ from: { name: sender.name, email: sender.email }, to: address, replyTo: sender.replyTo, ...message, headers: { 'X-Entity-Ref-ID': row.id } })
      await (await settle(row.id, { state: 'sent', providerRef: result.messageId })).commit()
      counts.sent++
    }
    catch (error) {
      const code = error instanceof MailError ? error.code : 'E_UNKNOWN'
      const mayPass = error instanceof MailError ? (error.retryable || DOMAIN_CODES.has(code)) && !RECIPIENT_CODES.has(code) : true
      if (mayPass && attempt < maxAttempts) {
        const wait = firstRetry * 4 ** (attempt - 1) // not-policy: the specification fixes each wait at four times the last
        await (await settle(row.id, { state: 'retrying', error: code, nextAttemptAt: nowMs() + wait * 1000 })).commit() // not-policy: seconds to milliseconds
        retries.set(wait, [...(retries.get(wait) ?? []), row.id])
        counts.retrying++
      }
      else {
        const outcome = await settle(row.id, { state: 'failed', error: code, reason: RECIPIENT_CODES.has(code) ? 'suppressed_address' : undefined })
        if (type.category === 'transactional')
          outcome.announce('core.delivery.failed', { notificationId: row.notification_id, typeKey: row.type_key, channel: 'email' })
        await outcome.commit()
        counts.failed++
      }
    }
  }
  for (const [wait, ids] of retries) unit.enqueue('core.send-notifications', { deliveryIds: ids }, { delay: wait })
  return counts
}
