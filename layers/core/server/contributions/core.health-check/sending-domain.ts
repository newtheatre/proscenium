// Health: can the theatre send email? (C-32: "the health check says so".)
import { useSetting } from '#kit'
import type { HealthCheck } from '../../points/health-check'

export default {
  async check() {
    const domain = await useSetting('core.notifications.sending-domain') as string | null
    const verified = await useSetting('core.notifications.verified-domain') as string | null
    if (!domain) return { state: 'failing', sentence: 'No sending domain is set, so no email can be sent, including sign-in links.', remedy: 'Set the sending domain on the Email sending screen in Site administration, then send a test message.' }
    if (domain !== verified) return { state: 'failing', sentence: `${domain} is not verified yet, so no email is sent.`, remedy: 'Send a test message from the Email sending screen to verify it.' }
    return { state: 'ok', sentence: `Email is sent from ${domain}.` }
  },
} satisfies HealthCheck
