import { consola } from 'consola'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { undeliverableReason } from '#shared/utils/deliverability'
import { deliversOn, messageType } from '#shared/utils/notifications'
import type { Channel, Preference } from '#shared/utils/notifications'
import { formatSender, senderForTopic, SENDERS } from '#shared/utils/senders'
import type { TemplateContext } from '#server/utils/templates'

// The only thing in this application that hands a message to a provider (0013, H-101). A CI
// check refuses the binding anywhere else, so there is one place these rules can be skipped.

interface Outbound {
  to: string
  from: string
  subject: string
  html: string
  text: string
}

interface Transport {
  name: string
  send: (message: Outbound) => Promise<void>
}

interface EmailBinding {
  send: (message: Outbound) => Promise<{ messageId?: string }>
}

// Local mail is written to .data/mail as well as logged, because the dev server does not reliably
// surface a handler's console output and a message nobody can read has not been delivered.
const MAILBOX = '.data/mail'

// The dev server runs on Node and does not surface a handler's console output, so a message with
// nowhere to go was being recorded as sent while nobody could read it.
async function writeToMailbox(message: Outbound): Promise<void> {
  if (!import.meta.dev) return
  try {
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(MAILBOX, { recursive: true })
    const stamp = new Date().toISOString().replaceAll(':', '-')
    await writeFile(`${MAILBOX}/${stamp}-${message.to.replace(/[^a-z0-9]+/gi, '-')}.txt`, [
      `To: ${message.to}`,
      `From: ${message.from}`,
      `Subject: ${message.subject}`,
      '',
      message.text,
    ].join('\n'))
  }
  catch (error) {
    consola.warn('[notify] could not write to the local mailbox', error)
  }
}

const consoleTransport: Transport = {
  name: 'console',
  async send(message) {
    // consola, not console.info: the dev server keeps info-level console output below its
    // threshold, so the transport was logging where nobody could see it.
    consola.info(`[notify] to ${message.to}: ${message.subject}\n${message.text}`)
    await writeToMailbox(message)
  },
}

// The event is optional because a scheduled task has none, and a task that cannot send is a task
// that silently does half its job (A-117 criterion 3).
function transportFor(event: H3Event | undefined): Transport {
  // Development never hands a message to a provider, whatever the emulator supplies: a stub
  // binding accepts a message and drops it, which reads as delivered (architecture.md).
  if (import.meta.dev) return consoleTransport

  const binding = (event?.context.cloudflare?.env as unknown as { EMAIL?: EmailBinding } | undefined)?.EMAIL
  if (!binding) return consoleTransport
  return {
    name: 'email-service',
    send: async message => void await binding.send(message),
  }
}

export interface Notification {
  type: string
  userId: string
  context: TemplateContext
}

type Status = 'SENT' | 'FAILED' | 'SKIPPED_UNDELIVERABLE'

async function record(userId: string | null, type: string, channel: Channel, status: Status, subject: string | null, error: string | null): Promise<void> {
  await db.insert(schema.notificationLog).values({
    id: crypto.randomUUID().replaceAll('-', ''),
    userId,
    type,
    channel,
    subject,
    status,
    sentAt: status === 'SENT' ? Math.floor(Date.now() / 1000) : null,
    error,
  })
}

// Sends one message. Every outcome is logged, including the ones that never reach a provider,
// so a silence is always explained somewhere.
export async function notify(event: H3Event | undefined, notification: Notification): Promise<Status> {
  const type = messageType(notification.type)

  // Read at send time, not at enqueue: an address changed in between reaches the new one
  // (H-101 criterion 5).
  const account = await findById(notification.userId)
  if (!account) {
    await record(null, notification.type, 'EMAIL', 'SKIPPED_UNDELIVERABLE', null, 'no-account')
    return 'SKIPPED_UNDELIVERABLE'
  }

  const undeliverable = undeliverableReason({ email: account.email, anonymisedAt: account.anonymisedAt })
  if (undeliverable) {
    await record(account.id, notification.type, 'EMAIL', 'SKIPPED_UNDELIVERABLE', null, undeliverable)
    return 'SKIPPED_UNDELIVERABLE'
  }

  // Only verification, claim and reset may reach an address nobody has proven (A-102).
  if (!account.verified && !type.reachesUnverified) {
    await record(account.id, notification.type, 'EMAIL', 'SKIPPED_UNDELIVERABLE', null, 'unverified-address')
    return 'SKIPPED_UNDELIVERABLE'
  }

  const preferences = await db.select({
    topic: schema.notificationPreferences.topic,
    email: schema.notificationPreferences.email,
    push: schema.notificationPreferences.push,
  }).from(schema.notificationPreferences).where(eq(schema.notificationPreferences.userId, account.id))

  if (!deliversOn(type, 'EMAIL', preferences as Preference[])) {
    await record(account.id, notification.type, 'EMAIL', 'SKIPPED_UNDELIVERABLE', null, 'preference')
    return 'SKIPPED_UNDELIVERABLE'
  }

  const sender = type.topic ? senderForTopic(type.topic) : SENDERS.ACCOUNTS
  const rendered = render(type.template, { ...notification.context, name: account.name })

  try {
    await transportFor(event).send({
      to: account.email,
      from: formatSender(sender),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
    await record(account.id, notification.type, 'EMAIL', 'SENT', rendered.subject, null)
    return 'SENT'
  }
  catch (error) {
    // The message is not lost: the log carries it, and retries are H-105's job.
    await record(account.id, notification.type, 'EMAIL', 'FAILED', rendered.subject, error instanceof Error ? error.message : String(error))
    return 'FAILED'
  }
}
