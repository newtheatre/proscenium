// The EMAIL_EVENTS queue (Formats tab, "A second queue, for email outcomes"). Cloudflare Email
// Sending reports each message's outcome to it through the sending domain's event subscription.
// The kit owns the queue: it hands each message to core's consumer, core.email-events, in a unit of
// work of its own, acknowledges or retries each message on its own, and sets aside what still
// cannot be matched. What an outcome means (matching the delivery, suppression, announcing
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
 * recorded yet (an outcome can come 0.6 seconds after send()), so the kit tries again shortly.
 * Throwing also tries again, after a longer wait; the unit is not committed.
 */
export type EmailEventOutcome = 'done' | 'not-yet'
export type EmailEventsConsumer = (event: EmailEvent, unit: UnitView, delivery: { id: string, attempts: number }) => Promise<EmailEventOutcome>

/** The waits before trying again, in seconds, and how many tries before a message is set aside. */
export const EMAIL_EVENT_RETRY = { notYet: 5, failed: 30, setAsideAfter: 5 } // not-policy: queue delivery tuning, matching max_retries in nuxt.config.ts

let consumer: EmailEventsConsumer | undefined

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

export async function handleEmailEvents(batch: MessageBatch<unknown>, env: KitEnv): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body
    const type = isEvent(body) ? body.type : 'unknown'
    const meta = { queueMessageId: message.id, type, attempts: message.attempts }
    if (!isEvent(body)) {
      log.warn('core.email-events.unreadable', meta)
      message.ack()
      continue
    }
    if (!consumer) {
      // Nothing records outcomes yet: retrying would only fill the dead-letter queue.
      log.warn('core.email-events.no-consumer', meta)
      message.ack()
      continue
    }
    const setAside = message.attempts >= EMAIL_EVENT_RETRY.setAsideAfter
    try {
      const outcome = await runInContext({ env, actor: { kind: 'job' }, module: 'core', cache: {} }, async () => {
        const unit = createUnit()
        const answer = await consumer!(body, unit.view(), { id: message.id, attempts: message.attempts })
        if (answer === 'done') await unit.commit()
        return answer
      })
      if (outcome === 'done') {
        message.ack()
        continue
      }
      if (setAside) log.warn('core.email-events.set-aside', meta)
      message.retry({ delaySeconds: EMAIL_EVENT_RETRY.notYet })
    }
    catch (error) {
      // Only the error's name: a provider's message may quote the address.
      log.error('core.email-events.failed', { ...meta, error: (error as Error)?.name ?? 'Error' })
      if (setAside) log.warn('core.email-events.set-aside', meta)
      message.retry({ delaySeconds: EMAIL_EVENT_RETRY.failed })
    }
  }
}
