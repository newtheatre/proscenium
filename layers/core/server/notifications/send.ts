// notifyAddress: one transactional email to one address that has no account, such as an invitation
// or a security notice to an old address. It joins notify()'s pipeline: the notification and its
// email delivery are written in the caller's unit, and core.send-notifications sends it after the
// commit, with the same retries, sealed variables and delivery log.
import { z } from 'zod'
import { first, isEnabled, refuse, sealSpecial, useContext, usePoint, useSetting } from '#kit'
import type { RecordRef, UnitView } from '#kit'
import { checkVariables, type VariableKind } from './render'
import { suppressedAddresses } from './suppression'
import { deliveries, notifications } from '../db/domain'

export interface NotificationType {
  id: string
  category: 'transactional' | 'optional'
  side: 'audience' | 'members'
  channels: ('email' | 'inbox')[]
  /** The inbox item's link: a path inside the application that may use the type's variables. */
  link?: string
  lane?: 'prompt' | 'bulk'
  topic?: string
  variables: Record<string, VariableKind>
  wording: Record<string, { subject: string, body: string }>
}

export interface NotifyAddressOptions {
  address: string
  variables: Record<string, string>
  locale?: string
  /** The same key on a second call, for the same type, sends nothing more. */
  dedupeKey?: string
  /** What the message is about, kept on the notification for the delivery log. */
  record?: RecordRef
}

export async function notificationType(typeKey: string): Promise<NotificationType> {
  const found = (await usePoint<NotificationType>('core.notification-type')).find(c => c.value.id === typeKey)
  if (!found) refuse('core.notifications.unknown-type', `No module declares a message called ${typeKey}.`, { status: 500 })
  return found.value
}

export interface Sender { key: string, name: string, email: string, replyTo?: string }

// The sending domain, once it is set and verified. Throws a retryable refusal otherwise (C-32).
export async function sendingDomain(): Promise<string> {
  const domain = await useSetting('core.notifications.sending-domain') as string | null
  const verified = await useSetting('core.notifications.verified-domain') as string | null
  if (!domain || domain !== verified) {
    refuse('core.notifications.domain-unverified', 'No email can be sent until the sending domain is set and verified.', {
      status: 503,
      remedy: 'An administrator sets the sending domain on the Email sending screen, then sends a test message to verify it.',
    })
  }
  return domain
}

/** Who a topic's mail comes from: its routed sender, or the default built from the settings. */
export async function senderFor(topic: string, domain: string): Promise<Sender> {
  const row = await first<{ key: string, display_name: string, local_part: string, reply_to: string | null }>(
    "SELECT s.key, s.display_name, s.local_part, s.reply_to FROM core_notification_routing r JOIN core_sender_identities s ON s.key = r.sender_key WHERE r.topic_key = ? AND s.state = 'active'",
    topic,
  )
  if (row) return { key: row.key, name: row.display_name, email: `${row.local_part}@${domain}`, replyTo: row.reply_to ?? undefined }
  const fallback = await first<{ key: string, display_name: string, local_part: string, reply_to: string | null }>(
    "SELECT key, display_name, local_part, reply_to FROM core_sender_identities WHERE key = 'default' AND state = 'active'",
  )
  if (fallback) return { key: 'default', name: fallback.display_name, email: `${fallback.local_part}@${domain}`, replyTo: fallback.reply_to ?? undefined }
  const contact = await useSetting('core.organisation.contact-email') as string | null
  return { key: 'default', name: await theatreName(domain), email: `no-reply@${domain}`, replyTo: contact ?? undefined }
}

export async function theatreName(fallback: string): Promise<string> {
  // A name left blank is no name: the message still needs somebody to be from.
  return (await useSetting('core.site.name') as string | null)?.trim() || fallback
}

async function dedupeKeyFor(typeKey: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${typeKey}\u0000${key}`))
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hexadecimal
  return `adr:${hex}`
}

/**
 * Records one email to `address` in the caller's unit; it is sent after the commit. A second call
 * with the same type and dedupe key writes nothing and returns the earlier notification. A caller
 * that sends to several addresses calls this once for each, in the same unit.
 */
export async function notifyAddress(unit: UnitView, typeKey: string, options: NotifyAddressOptions): Promise<{ sent: boolean, notificationId: string }> {
  const declared = (await usePoint<NotificationType>('core.notification-type')).find(c => c.value.id === typeKey)
  if (!declared) refuse('core.notifications.unknown-type', `No module declares a message called ${typeKey}.`, { status: 500 })
  const type = declared.value
  if (type.category !== 'transactional') refuse('core.notifications.not-transactional', `${typeKey} is not transactional, so it needs an account and notify().`, { status: 500 })
  if (!type.channels.includes('email')) refuse('core.notifications.no-channel', `${typeKey} is not sent by email.`, { status: 500 })
  const address = options.address.trim()
  if (!z.email().safeParse(address).success) refuse('core.notifications.bad-address', 'This is not an email address.', { status: 422, fields: { address: 'invalid' } })
  const values = checkVariables(type.variables, options.variables ?? {})

  const dedupe = options.dedupeKey ? await dedupeKeyFor(typeKey, options.dedupeKey) : null
  if (dedupe) {
    const earlier = await first<{ id: string }>('SELECT id FROM core_notifications WHERE dedupe_key = ?', dedupe)
    if (earlier) return { sent: false, notificationId: earlier.id }
  }

  const fallbackLocale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const locale = [options.locale, fallbackLocale].find(l => !!l && !!type.wording[l]) ?? 'en-GB'
  const sealedNames = Object.keys(type.variables).filter(name => type.variables[name] === 'sealed')
  const open = Object.fromEntries(Object.entries(values).filter(([k]) => !sealedNames.includes(k)))
  const hidden = Object.fromEntries(Object.entries(values).filter(([k]) => sealedNames.includes(k)))
  const record = options.record ? (Array.isArray(options.record) ? { type: options.record[0], id: options.record[1] ?? null } : { type: (options.record as any).type, id: (options.record as any).id ?? null }) : { type: null, id: null }
  const [notificationId] = unit.insertSet(notifications, [{
    typeKey,
    side: type.side,
    accountId: null,
    address,
    locale,
    subjectType: record.type,
    subjectId: record.id,
    dedupeKey: dedupe,
    payload: open,
    sealedVariables: sealedNames.length ? await sealSpecial(JSON.stringify(hidden)) : null,
    actorId: useContext().actor.accountId ?? null,
  }])

  const state = !(await isEnabled(declared.module))
    ? { state: 'skipped' as const, reason: 'module_off' }
    : (await suppressedAddresses([address])).has(address.toLowerCase())
        ? { state: 'skipped' as const, reason: 'suppressed_address' }
        : { state: 'queued' as const, reason: null }
  const [deliveryId] = unit.insertSet(deliveries, [{ notificationId: notificationId!, side: type.side, channel: 'email', ...state, senderKey: null }])
  if (state.state === 'queued') unit.enqueue('core.send-notifications', { deliveryIds: [deliveryId!] }, { lane: type.lane ?? 'prompt' })
  return { sent: true, notificationId: notificationId! }
}
