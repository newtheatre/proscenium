// notifyAddress: the phase 1 form of C-27. One call sends one transactional email to one address,
// from inside the caller's job. Nothing about the message (address, variables, wording) is written
// to the database or the log; a failure throws, so the caller's job retries with the kit's back-off
// and, after its last attempt, is shown as failed and announces core.job.died (C-28).
import { z } from 'zod'
import { cache, first, refuse, usePoint, useSetting } from '#kit'
import type { RecordRef, UnitView } from '#kit'
import { DOMAIN_CODES, MailError, useMailer } from './mailer'
import { checkVariables, render, type VariableKind } from './render'
import { brandTokens } from '../brand/theme'

export interface NotificationType {
  id: string
  category: 'transactional' | 'optional'
  side: 'audience' | 'members'
  channels: 'email'[]
  lane?: 'prompt' | 'bulk'
  topic?: string
  variables: Record<string, VariableKind>
  wording: Record<string, { subject: string, body: string }>
}

export interface NotifyAddressOptions {
  address: string
  variables: Record<string, string>
  locale?: string
  /** The same key on a second call sends nothing more, for as long as core.idempotency.keep-for. */
  dedupeKey?: string
  /** What the message is about. Unused until the full pipeline keeps a log. */
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
      remedy: 'An administrator sets the sending domain in Settings, then sends a test message to verify it.',
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
  return (await useSetting('core.site.name') as string | null) ?? fallback
}

async function dedupeKeyFor(typeKey: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${typeKey}\u0000${key}`))
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hexadecimal
  return `core:notify:${hex}`
}

/**
 * Renders the type's wording with the caller's variables and sends it at once through the mail
 * binding. Call it inside your own job. `unit` is the caller's unit: unused in phase 1, it is where
 * the full pipeline (phase 2) will add the notification and its deliveries, with no change here.
 */
export async function notifyAddress(unit: UnitView, typeKey: string, options: NotifyAddressOptions): Promise<{ sent: boolean }> {
  void unit
  const type = await notificationType(typeKey)
  if (type.category !== 'transactional') refuse('core.notifications.not-transactional', `${typeKey} is not transactional, so it needs the full notification pipeline.`, { status: 500 })
  if (!type.channels.includes('email')) refuse('core.notifications.no-channel', `${typeKey} is not sent by email.`, { status: 500 })
  if (!z.email().safeParse(options.address).success) refuse('core.notifications.bad-address', 'This is not an email address.', { status: 422, fields: { address: 'invalid' } })
  const values = checkVariables(type.variables, options.variables ?? {})

  const domain = await sendingDomain()
  const dedupe = options.dedupeKey ? await dedupeKeyFor(typeKey, options.dedupeKey) : undefined
  if (dedupe && await cache.get(dedupe)) return { sent: false }

  const locale = options.locale && type.wording[options.locale] ? options.locale : 'en-GB'
  const sender = await senderFor(type.topic ?? 'transactional', domain)
  const brand = await brandTokens()
  const message = render(type.wording[locale]!, {
    values,
    kinds: type.variables,
    accent: brand.light.link,
    theatre: await theatreName(domain),
    footer: await useSetting('core.notifications.email-footer') as string | null,
  })

  try {
    await useMailer()({ from: { name: sender.name, email: sender.email }, to: options.address.trim(), replyTo: sender.replyTo, ...message })
  }
  catch (error) {
    if (error instanceof MailError && DOMAIN_CODES.has(error.code)) {
      refuse('core.notifications.domain-unverified', 'The mail service refused the sending domain.', { status: 503, remedy: 'Check the domain is onboarded for sending in Cloudflare, then verify it again in Settings.' })
    }
    throw error
  }
  if (dedupe) await cache.put(dedupe, 1, { ttl: await useSetting('core.idempotency.keep-for') as number })
  return { sent: true }
}
