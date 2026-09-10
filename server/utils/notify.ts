import { db, schema } from '@nuxthub/db'
import { consola } from 'consola'
import { eq, inArray } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { findById } from './accounts'
import { MAILBOX, writeToMailbox } from './mailbox'
import { preferenceDefaults, storedPreferences } from './notification-preferences'
import { render } from './templates'
import { undeliverableReason } from '#shared/utils/deliverability'
import { deliversOn, isTransactional, messageType } from '#shared/utils/notifications'
import { formatSender, senderForTopic, SENDERS } from '#shared/utils/senders'
import type { Channel, MessageType, NotificationStatus } from '#shared/utils/notifications'
import type { TemplateContext } from '#server/utils/templates'
import type { H3Event } from 'h3'

// The only thing in this application that hands a message to a provider (0013, H-101). A CI
// check refuses the binding anywhere else, so there is one place these rules can be skipped.

// MUST stay the bare literal: read through a type assertion it compiles to
// `globalThis._importMeta_.dev`, which no bundle sets, and every guard below silently lifts.
const isDev = (): boolean => Boolean(import.meta.dev)

export interface Attachment {
  filename: string
  contentType: string
  content: string
}

interface Outbound {
  to: string
  from: string
  subject: string
  html: string
  text: string
  attachments?: Attachment[]
}

interface Transport {
  name: string
  send: (message: Outbound) => Promise<void>
}

interface EmailBinding {
  send: (message: Outbound) => Promise<{ messageId?: string }>
}

// A message nobody can read has not been delivered, so a failure here is said out loud rather
// than swallowed: the mailbox is the only copy of a development send.
async function toMailbox(message: Outbound): Promise<void> {
  if (!isDev()) return
  try {
    await writeToMailbox(message)
  }
  catch (error) {
    consola.warn(`[notify] could not write to the local mailbox at ${MAILBOX}`, error)
  }
}

const consoleTransport: Transport = {
  name: 'console',
  async send(message) {
    // consola, not console.info: the dev server keeps info-level console output below its
    // threshold, so the transport was logging where nobody could see it.
    consola.info(`[notify] to ${message.to}: ${message.subject}\n${message.text}`)
    await toMailbox(message)
  },
}

// The event is optional because a scheduled task has none, and a task that cannot send is a task
// that silently does half its job (A-117 criterion 3).
function transportFor(event: H3Event | undefined): Transport {
  // Development never hands a message to a provider, whatever the emulator supplies: a stub
  // binding accepts a message and drops it, which reads as delivered (architecture.md).
  if (isDev()) return consoleTransport

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
  // Built by the caller, because what a message carries is the caller's business rather than the
  // template's. A transport that cannot attach still sends the message (C-104 criterion 1).
  attachments?: Attachment[]
  // The key(s) claimNotification() was called with. Present, notify() updates that row (or, for
  // a digest, every claimed row) to its outcome instead of inserting a second one (0048).
  claim?: string | string[]
}

// The terminal outcomes of one send. `PENDING` is claimNotification()'s and `RETRYING` is
// H-105's, so neither is an answer notify() ever returns (0048).
type Status = Exclude<NotificationStatus, 'PENDING' | 'RETRYING'>

// A claim updates in place; an unclaimed send inserts fresh, exactly as before claims existed.
async function record(userId: string | null, type: string, channel: Channel, status: Status, subject: string | null, error: string | null, claim?: string | string[]): Promise<void> {
  const sentAt = status === 'SENT' ? Math.floor(Date.now() / 1000) : null
  if (claim) {
    const matches = Array.isArray(claim) ? inArray(schema.notificationLog.claim, claim) : eq(schema.notificationLog.claim, claim)
    await db.update(schema.notificationLog).set({ status, subject, sentAt, error }).where(matches)
    return
  }
  await db.insert(schema.notificationLog).values({
    id: crypto.randomUUID().replaceAll('-', ''),
    userId,
    type,
    channel,
    subject,
    status,
    sentAt,
    error,
  })
}

// The in-app channel. Never coalesced and never suppressed, so the individual entries stay
// answerable per change (H-102 criterion 6, H-104 criterion 4).
async function recordInbox(userId: string, type: string, title: string, body: string): Promise<void> {
  await db.insert(schema.inboxItems).values({
    id: crypto.randomUUID().replaceAll('-', ''),
    userId,
    type,
    title,
    body,
  })
}

// A transactional type is not asked about at all, so a suppressed transactional message is not
// a state this can reach (H-103 criterion 4).
async function emailIsWanted(event: H3Event | undefined, type: MessageType, userId: string): Promise<boolean> {
  if (isTransactional(type)) return true
  return deliversOn(type, 'EMAIL', await storedPreferences(userId), await preferenceDefaults(event))
}

// The row and the unique index refuse a second attempt, so a caller never reads before writing
// (0006, G-125). Written PENDING: notify() updates this row to its outcome, one row per send (0048).
export async function claimNotification(claim: {
  userId: string
  type: string
  key: string
  recordId?: string
  sessionId?: string
}): Promise<boolean> {
  const taken = await db.insert(schema.notificationLog).values({
    id: crypto.randomUUID().replaceAll('-', ''),
    userId: claim.userId,
    type: claim.type,
    channel: 'EMAIL',
    status: 'PENDING',
    recordId: claim.recordId,
    sessionId: claim.sessionId,
    claim: claim.key,
  }).onConflictDoNothing().returning({ id: schema.notificationLog.id })

  return taken.length > 0
}

// Whether a claim is already held, for a dry run that must report without taking it.
export async function claimHeld(key: string): Promise<boolean> {
  const found = await db.select({ id: schema.notificationLog.id })
    .from(schema.notificationLog)
    .where(eq(schema.notificationLog.claim, key))
    .limit(1)
  return found.length > 0
}

// Sends one message. Every outcome is logged, including the ones that never reach a provider,
// so a silence is always explained somewhere.
export async function notify(event: H3Event | undefined, notification: Notification): Promise<Status> {
  const type = messageType(notification.type)

  // Read at send time, not at enqueue: an address changed in between reaches the new one
  // (H-101 criterion 5).
  const account = await findById(notification.userId)
  if (!account) {
    await record(null, notification.type, 'EMAIL', 'SKIPPED_UNDELIVERABLE', null, 'no-account', notification.claim)
    return 'SKIPPED_UNDELIVERABLE'
  }

  const sender = type.sender ? SENDERS[type.sender] : type.topic ? senderForTopic(type.topic) : SENDERS.ACCOUNTS
  const rendered = render(type.template, { ...notification.context, name: account.name })

  const undeliverable = undeliverableReason({ email: account.email, anonymisedAt: account.anonymisedAt })

  // Written before the email is judged: a preference or a bounce must not make a message
  // unfindable, and an anonymised account gets nothing (H-102 criterion 6, H-107).
  if (undeliverable !== 'anonymised' && type.channels.includes('INBOX')) {
    await recordInbox(account.id, notification.type, rendered.subject, rendered.text)
  }

  if (undeliverable) {
    await record(account.id, notification.type, 'EMAIL', 'SKIPPED_UNDELIVERABLE', null, undeliverable, notification.claim)
    return 'SKIPPED_UNDELIVERABLE'
  }

  // Only verification, claim and reset may reach an address nobody has proven (A-102).
  if (!account.verified && !type.reachesUnverified) {
    await record(account.id, notification.type, 'EMAIL', 'SKIPPED_UNDELIVERABLE', null, 'unverified-address', notification.claim)
    return 'SKIPPED_UNDELIVERABLE'
  }

  if (!await emailIsWanted(event, type, account.id)) {
    await record(account.id, notification.type, 'EMAIL', 'SUPPRESSED_PREFERENCE', null, null, notification.claim)
    return 'SUPPRESSED_PREFERENCE'
  }

  try {
    await transportFor(event).send({
      to: account.email,
      from: formatSender(sender),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      ...(notification.attachments?.length ? { attachments: notification.attachments } : {}),
    })
    await record(account.id, notification.type, 'EMAIL', 'SENT', rendered.subject, null, notification.claim)
    return 'SENT'
  }
  catch (error) {
    // The message is not lost: the log carries it, and retries are H-105's job.
    await record(account.id, notification.type, 'EMAIL', 'FAILED', rendered.subject, error instanceof Error ? error.message : String(error), notification.claim)
    return 'FAILED'
  }
}

export interface RawMessage {
  to: string
  subject: string
  html: string
  text: string
}

// For a recipient with no account behind it, such as a committee-configured address (E-124):
// `notification_log`'s shape assumes a user on every row, so the caller logs its own outcome.
export async function sendRaw(event: H3Event | undefined, message: RawMessage): Promise<{ ok: true } | { ok: false, error: string }> {
  try {
    await transportFor(event).send({
      to: message.to,
      from: formatSender(SENDERS.ACCOUNTS),
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
    return { ok: true }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
