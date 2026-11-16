// Verifies the sending domain by sending a test message to the theatre's contact address (C-32).
// Mail is sent only once this succeeds. The address is a role address from the settings, never the
// administrator's own, so nothing personal is involved. The verify route calls it, and so does the
// job that follows setting the domain up automatically (C-52).
import { changeSetting, createUnit, refuse, useSetting } from '#kit'
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
    { values: {}, kinds: {}, accent: (await brandTokens()).light.link, theatre },
  )
  try {
    await useMailer()({ from: { name: sender.name, email: sender.email }, to, ...message })
  }
  catch (error) {
    const code = error instanceof MailError ? error.code : 'E_UNKNOWN'
    if (await useSetting('core.notifications.verified-domain')) {
      const reset = createUnit()
      await changeSetting(reset, 'core.notifications.verified-domain', null, { reset: true })
      await reset.commit()
    }
    return { verified: false, domain, code }
  }
  await changeSetting(unit, 'core.notifications.verified-domain', domain)
  return { verified: true, domain }
}
