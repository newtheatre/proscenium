// Verifies the sending domain by sending a test message to the theatre's contact address (C-32).
// Mail is sent only once this succeeds. The address is a role address from the settings, never the
// administrator's own, so nothing personal is involved.
import { z } from 'zod'
import { defineRoute, changeSetting, createUnit, refuse, useSetting } from '#kit'
import { MailError, DOMAIN_CODES, useMailer } from '../../../notifications/mailer'
import { senderFor, theatreName } from '../../../notifications/send'
import { brandTokens } from '../../../brand/theme'
import { render } from '../../../notifications/render'

export default defineRoute({
  ability: 'core.sender.manage',
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit }) => {
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
    if (DOMAIN_CODES.has(code)) refuse('core.notifications.domain-unverified', `The mail service does not accept ${domain} as a sender yet.`, { status: 409, remedy: 'Onboard the domain for Email Sending in the Cloudflare dashboard, wait for its DNS records to be checked, then try again.' })
    refuse('core.notifications.test-failed', `The test message could not be sent (${code}).`, { status: 502 })
  }
  await changeSetting(unit, 'core.notifications.verified-domain', domain)
  return { domain, verified: true }
})
