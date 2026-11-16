// Verifies the sending domain with a test message to the theatre's contact address (C-32).
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { DOMAIN_CODES } from '../../../notifications/mailer'
import { verifySendingDomain } from '../../../notifications/verify'

export default defineRoute({
  ability: 'core.sender.manage',
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit }) => {
  const result = await verifySendingDomain(unit)
  if (!result.verified) {
    if (DOMAIN_CODES.has(result.code)) refuse('core.notifications.domain-unverified', `The mail service does not accept ${result.domain} as a sender yet.`, { status: 409, remedy: 'Onboard the domain for Email Sending in the Cloudflare dashboard, wait for its DNS records to be checked, then try again.' })
    refuse('core.notifications.test-failed', `The test message could not be sent (${result.code}).`, { status: 502 })
  }
  return { domain: result.domain, verified: true }
})
