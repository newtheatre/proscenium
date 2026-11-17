// C-52: the outcome of asking Cloudflare to set up the sending subdomain. On success the domain
// becomes the sending domain, any earlier verification is cleared, and the verify job is queued to
// wait out Cloudflare's first minutes (E_EMAIL_SENDING_NOT_READY) before sending the test message.
import { changeSetting, defineCall, useSetting } from '#kit'
import { findZone, listSendingSubdomains } from '../notifications/cloudflare'

/** The domain an attempt was for: its reference is core.sending-domain:<name>. */
export const domainOf = (reference: string) => reference.slice(reference.indexOf(':') + 1)

/** How long the verify job first waits: Cloudflare refuses sends for about two minutes after onboarding. */
export const FIRST_VERIFY_WAIT = 60 // not-policy: seconds, from proof P-COM-3; the job retries after it

export default defineCall({
  async outcome(unit, outcome, attempt) {
    if (outcome.result !== 'succeeded') return
    const domain = domainOf(attempt.reference)
    if (await useSetting('core.notifications.sending-domain') !== domain)
      await changeSetting(unit, 'core.notifications.sending-domain', domain, { confirm: true })
    if (await useSetting('core.notifications.verified-domain') !== domain && await useSetting('core.notifications.verified-domain') !== null)
      await changeSetting(unit, 'core.notifications.verified-domain', null, { reset: true, confirm: true })
    unit.enqueue('core.verify-sending-domain', { domain, tries: 1 }, { delay: FIRST_VERIFY_WAIT })
  },
  async reconcile(attempt) {
    const domain = domainOf(attempt.reference)
    try {
      const zone = await findZone(domain)
      if (!zone) return { result: 'failed' }
      const found = (await listSendingSubdomains(zone.id)).find(s => s.name === domain && s.enabled)
      return found ? { result: 'succeeded', providerReference: found.tag } : { result: 'failed' }
    }
    catch {
      return 'unknown'
    }
  },
})
