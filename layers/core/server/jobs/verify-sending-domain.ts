// C-52: after the sending domain is set up automatically, sends the test message once Cloudflare
// accepts the domain. While the domain is not ready yet, it tries again a minute later, up to ten
// times; after that the health check and the sender screen say the domain is not verified, and the
// administrator can send a test message by hand.
import { defineJob, useSetting } from '#kit'
import { DOMAIN_CODES } from '../notifications/mailer'
import { verifySendingDomain } from '../notifications/verify'

const TRIES = 10 // not-policy: ten minutes covers Cloudflare's few minutes of onboarding with room to spare
const WAIT = 60 // not-policy: seconds between tries

export default defineJob<{ domain: string, tries: number }>(async (payload, unit) => {
  // Someone changed the domain meanwhile, or verified it by hand: nothing left to do.
  if (await useSetting('core.notifications.sending-domain') !== payload.domain) return
  if (await useSetting('core.notifications.verified-domain') === payload.domain) return
  if (!await useSetting('core.organisation.contact-email')) return
  const result = await verifySendingDomain(unit)
  if (!result.verified && DOMAIN_CODES.has(result.code) && payload.tries < TRIES)
    unit.enqueue('core.verify-sending-domain', { domain: payload.domain, tries: payload.tries + 1 }, { delay: WAIT })
})
