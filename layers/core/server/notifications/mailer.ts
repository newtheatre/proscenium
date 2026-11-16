// The one place that touches the mail binding (Cloudflare Email Sending). Tests swap it for a
// recorder with setMailer(), as they swap the queues with setDispatcher().
import { useContext } from '#kit/context'

export interface OutgoingEmail {
  from: { name: string, email: string }
  to: string
  replyTo?: string
  subject: string
  text: string
  html: string
  headers?: Record<string, string>
}

export type Mailer = (message: OutgoingEmail) => Promise<{ messageId?: string }>

/**
 * A send that failed, carrying only the provider's code. The provider's own message can quote the
 * address, so it is never kept: this error is what reaches a job's last_error and the log.
 */
export class MailError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(`core.notifications.send-failed: ${code}`)
    this.name = 'MailError'
  }
}

// Codes that will not change by trying again with the same message.
const PERMANENT = new Set(['E_VALIDATION_ERROR', 'E_FIELD_MISSING', 'E_TOO_MANY_RECIPIENTS', 'E_RECIPIENT_SUPPRESSED', 'E_RECIPIENT_NOT_ALLOWED', 'E_CONTENT_TOO_LARGE', 'E_HEADER_NOT_ALLOWED', 'E_HEADER_USE_API_FIELD', 'E_HEADER_VALUE_INVALID', 'E_HEADER_NAME_INVALID'])
// Codes that mean the sending domain is not ready: retried, because an administrator can fix it.
export const DOMAIN_CODES = new Set(['E_SENDER_NOT_VERIFIED', 'E_SENDER_DOMAIN_NOT_AVAILABLE'])

const binding: Mailer = async (message) => {
  const email = useContext().env.EMAIL
  if (!email) throw new MailError('E_NO_BINDING', true)
  try {
    const result = await email.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    } as any)
    return { messageId: (result as any)?.messageId }
  }
  catch (error) {
    const code = typeof (error as any)?.code === 'string' && /^E_[A-Z_]+$/.test((error as any).code) ? (error as any).code : 'E_UNKNOWN'
    throw new MailError(code, !PERMANENT.has(code))
  }
}

let current: Mailer = binding

/** Replaces the mail binding, for tests. Passing nothing restores it. */
export function setMailer(next?: Mailer): void {
  current = next ?? binding
}

export function useMailer(): Mailer {
  return current
}
