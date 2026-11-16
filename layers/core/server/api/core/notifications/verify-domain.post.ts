// Verifies the sending domain with a test message to the theatre's contact address (C-32). A
// verify job queued by the automatic set-up (C-52) is cancelled first, or, if it has started, left
// to send its own message, so one press never brings two.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { DOMAIN_CODES } from '../../../notifications/mailer'
import { resumeVerification, takeOverVerification, verifySendingDomain } from '../../../notifications/verify'

export default defineRoute({
  ability: 'core.sender.manage',
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit }) => {
  const taken = await takeOverVerification()
  if (taken.state === 'running')
    refuse('core.notifications.test-under-way', 'A test message is being sent now.', { status: 409, remedy: 'Check the contact inbox in a minute, then refresh this page.' })
  const result = await verifySendingDomain(unit)
  if (!result.verified) {
    // Cloudflare is still setting the domain up: the automatic retries this press cancelled resume.
    if (DOMAIN_CODES.has(result.code) && taken.cancelled === result.domain) {
      await resumeVerification(result.domain)
      refuse('core.notifications.domain-not-ready', `Cloudflare is still setting up ${result.domain}.`, { status: 409, remedy: 'A test message goes to the contact address by itself once Cloudflare accepts it, usually within a few minutes.' })
    }
    if (DOMAIN_CODES.has(result.code)) refuse('core.notifications.domain-unverified', `The mail service does not accept ${result.domain} as a sender yet.`, { status: 409, remedy: 'Onboard the domain for Email Sending in the Cloudflare dashboard, wait for its DNS records to be checked, then try again.' })
    refuse('core.notifications.test-failed', `The test message could not be sent (${result.code}).`, { status: 502 })
  }
  return { domain: result.domain, verified: true }
})
