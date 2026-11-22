// Verifies the sending domain by sending a test message to the theatre's contact address (C-32).
// Mail is sent only once this succeeds. The address is a role address from the settings, never the
// administrator's own, so nothing personal is involved. The verify route calls it, and so does the
// job that follows setting the domain up automatically (C-52).
import { changeSetting, createUnit, first, nowMs, refuse, useSetting } from '#kit'
import type { UnitView } from '#kit'
import { MailError, useMailer } from './mailer'
import { senderFor, theatreName } from './send'
import { brandTokens } from '../brand/theme'
import { render } from './render'

export type VerifyResult = { verified: true, domain: string } | { verified: false, domain: string, code: string }

/**
 * Sends the test message. On success, records the domain as verified in `unit`; on failure, clears
 * any earlier verification at once, in its own unit, so nothing is sent from a domain that no
 * longer works. Refuses only when there is no domain or no contact address.
 */
export async function verifySendingDomain(unit: UnitView): Promise<VerifyResult> {
  const domain = await useSetting('core.notifications.sending-domain') as string | null
  if (!domain) refuse('core.notifications.no-domain', 'Set the sending domain first.', { status: 409 })
  const to = await useSetting('core.organisation.contact-email') as string | null
  if (!to) refuse('core.notifications.no-contact', 'The test message goes to the theatre\'s contact email, which is not set.', { status: 409, remedy: 'Set the contact email in the organisation settings.' })
  const sender = await senderFor('transactional', domain)
  const theatre = await theatreName(domain)
  const message = render(
    { subject: 'Test message from {{ theatre }}', body: 'This message confirms that {{ theatre }} can send email from this domain. Nothing else needs doing.' },
    { values: {}, kinds: {}, accent: (await brandTokens()).light.link, dark: (await brandTokens()).dark, theatre },
  )
  try {
    await useMailer()({ from: { name: sender.name, email: sender.email }, to, ...message })
  }
  catch (error) {
    const code = error instanceof MailError ? error.code : 'E_UNKNOWN'
    if (await useSetting('core.notifications.verified-domain')) {
      const reset = createUnit()
      await changeSetting(reset, 'core.notifications.verified-domain', null, { reset: true, confirm: true })
      await reset.commit()
    }
    return { verified: false, domain, code }
  }
  await changeSetting(unit, 'core.notifications.verified-domain', domain, { confirm: true })
  return { verified: true, domain }
}

const VERIFY_JOB = 'core.verify-sending-domain'

/**
 * Before a test message sent by hand: cancels any verify job still waiting, so the two cannot both
 * send (C-52 queues one after setting the domain up). Cancelling is a conditional write, as is a
 * job's own start, so exactly one of them wins. Answers 'running' when a job has already started:
 * its message is on the way and the caller sends nothing.
 */
export async function takeOverVerification(): Promise<{ state: 'clear' | 'running', cancelled: string | null }> {
  const waiting = await first<{ payload: string }>("SELECT payload FROM core_jobs WHERE name = ? AND state = 'queued' ORDER BY created_at DESC LIMIT 1", VERIFY_JOB)
  const unit = createUnit()
  unit.add({ sql: "UPDATE core_jobs SET state = 'cancelled', finished_at = ? WHERE name = ? AND state = 'queued'", params: [nowMs(), VERIFY_JOB] })
  await unit.commit()
  const running = await first("SELECT 1 FROM core_jobs WHERE name = ? AND state = 'running'", VERIFY_JOB)
  return { state: running ? 'running' : 'clear', cancelled: waiting ? (JSON.parse(waiting.payload) as { domain: string }).domain : null }
}

/** Puts back the automatic retries a hand-sent test cancelled, when Cloudflare is not ready yet. */
export async function resumeVerification(domain: string): Promise<void> {
  const unit = createUnit()
  unit.enqueue(VERIFY_JOB, { domain, tries: 1 }, { delay: RESUME_WAIT })
  await unit.commit()
}

const RESUME_WAIT = 60 // not-policy: seconds, as the automatic set-up first waits
