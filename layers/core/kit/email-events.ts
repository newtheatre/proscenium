// The EMAIL_EVENTS queue (Formats tab, "A second queue, for email outcomes"). Cloudflare Email
// Sending reports each message's outcome to it through the sending domain's event subscription.
// The kit owns the queue: it hands each message to core's consumer, core.email-events, in a unit of
// work of its own, acknowledges or retries each message on its own, and sets aside what still
// cannot be read or matched. Nothing it cannot read or match is ever acknowledged: it is retried
// until the queue moves it to the dead-letter queue, and on its last attempt the core domain keeps
// a row saying so, for the health screen (core part 4). What an outcome means (matching the delivery, suppression, announcing
// core.delivery.*) is the core domain's.
import { runInContext, type KitEnv } from './context'
import { createUnit, type UnitView } from './unit'
import { log } from './log'

/**
 * One outcome as Cloudflare sends it. The payload names the recipient and the subject, which are
 * personal data: the kit never logs it, only the queue message's id and the event's type.
 */
export interface EmailEvent {
  /** Such as cf.email.sending.message.bounced. */
  type: string
  payload: {
    /** Exactly as send() returned it, angle brackets included. */
    messageId: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * 'done': the outcome is recorded (or deliberately ignored). 'not-yet': its send has not been
 * recorded yet (an outcome can come 0.6 seconds after send()), so the kit tries again shortly,
 * without committing. 'unmatched': no delivery matches it, but what the consumer wrote (such as a
 * suppression) stands: the kit commits the unit and still tries again, and on the last attempt sets
 * the event aside. Throwing also tries again, after a longer wait; the unit is not committed.
 */
export type EmailEventOutcome = 'done' | 'not-yet' | 'unmatched'

/** The event types core knows, the last part of the type name. Any other is set aside as null. */
export const EMAIL_EVENT_TYPES = ['delivered', 'deferred', 'bounced', 'failed', 'rejected', 'complained'] as const
export type EmailEventType = typeof EMAIL_EVENT_TYPES[number]

/** What the kit tells core about an event it is giving up on. No text from the message is passed. */
export interface SetAside { queueMessageId: string, type: EmailEventType | null, reason: 'unreadable' | 'unmatched' }
export type EmailEventsConsumer = (event: EmailEvent, unit: UnitView, delivery: { id: string, attempts: number }) => Promise<EmailEventOutcome>

/** The waits before trying again, in seconds, and how many tries before a message is set aside. */
export const EMAIL_EVENT_RETRY = { notYet: 5, failed: 30, setAsideAfter: 5 } // not-policy: queue delivery tuning, matching max_retries in nuxt.config.ts

let consumer: EmailEventsConsumer | undefined
let keepSetAside: ((info: SetAside) => Promise<void>) | undefined

/** Where core records an event given up on (core_email_events_set_aside); a test installs its own. */
export function setEmailEventsSetAside(next: ((info: SetAside) => Promise<void>) | undefined): void {
  keepSetAside = next
}

/** One of the six known types, read from the event's type name, or null. Never the raw text. */
export function knownType(body: unknown): EmailEventType | null {
  const type = (body as { type?: unknown } | undefined)?.type
  if (typeof type !== 'string') return null
  const last = type.slice(type.lastIndexOf('.') + 1)
  return (EMAIL_EVENT_TYPES as readonly string[]).includes(last) ? last as EmailEventType : null
}

/** Core's consumer, core.email-events, installed by the core domain; a test installs its own. */
export function setEmailEventsConsumer(next: EmailEventsConsumer | undefined): void {
  consumer = next
}

/** Whether a batch came from the EMAIL_EVENTS queue, which is named `<worker>-email-events`. */
export function isEmailEventsQueue(queue: string): boolean {
  return queue.endsWith('-email-events')
}

function isEvent(body: unknown): body is EmailEvent {
  const b = body as EmailEvent | undefined
  return !!b && typeof b.type === 'string' && !!b.payload && typeof b.payload.messageId === 'string'
}

async function setAside(env: KitEnv, info: SetAside, meta: Record<string, unknown>): Promise<void> {
  log.warn('core.email-events.set-aside', { ...meta, reason: info.reason })
  if (!keepSetAside) return
  try {
    await runInContext({ env, actor: { kind: 'job' }, module: 'core', cache: {} }, () => keepSetAside!(info))
  }
  catch (error) {
    log.error('core.email-events.set-aside-failed', { ...meta, error: (error as Error)?.name ?? 'Error' })
  }
}

export async function handleEmailEvents(batch: MessageBatch<unknown>, env: KitEnv): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body
    const type = knownType(body)
    const meta = { queueMessageId: message.id, type: type ?? 'unknown', attempts: message.attempts }
    const last = message.attempts >= EMAIL_EVENT_RETRY.setAsideAfter
    if (!isEvent(body)) {
      // Never dropped and never guessed at: tried again until the dead-letter queue takes it.
      log.warn('core.email-events.unreadable', meta)
      if (last) await setAside(env, { queueMessageId: message.id, type, reason: 'unreadable' }, meta)
      message.retry({ delaySeconds: EMAIL_EVENT_RETRY.notYet })
      continue
    }
    if (!consumer) {
      // Nothing records outcomes yet: retrying would only fill the dead-letter queue.
      log.warn('core.email-events.no-consumer', meta)
      message.ack()
      continue
    }
    try {
      const outcome = await runInContext({ env, actor: { kind: 'job' }, module: 'core', cache: {} }, async () => {
        const unit = createUnit()
        const answer = await consumer!(body, unit.view(), { id: message.id, attempts: message.attempts })
        if (answer !== 'not-yet') await unit.commit()
        return answer
      })
      if (outcome === 'done') {
        message.ack()
        continue
      }
      if (last) await setAside(env, { queueMessageId: message.id, type, reason: 'unmatched' }, meta)
      message.retry({ delaySeconds: EMAIL_EVENT_RETRY.notYet })
    }
    catch (error) {
      // Only the error's name: a provider's message may quote the address.
      log.error('core.email-events.failed', { ...meta, error: (error as Error)?.name ?? 'Error' })
      if (last) log.warn('core.email-events.set-aside', meta)
      message.retry({ delaySeconds: EMAIL_EVENT_RETRY.failed })
    }
  }
}
