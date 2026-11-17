// Health: email outcomes the queue could not read or match (core part 4). Each was retried until the
// dead-letter queue took it; this says how many, so a change in Cloudflare's events is noticed.
import { first, nowMs } from '#kit'
import type { HealthCheck } from '../../points/health-check'

const WEEK = 7 * 86_400_000 // not-policy: the health line looks back seven days

export default {
  async check() {
    const row = await first<{ n: number }>('SELECT count(*) AS n FROM core_email_events_set_aside WHERE set_aside_at >= ?', nowMs() - WEEK)
    const n = row?.n ?? 0
    if (!n) return { state: 'ok', sentence: 'Every email outcome in the last 7 days was read and matched.' }
    return {
      state: 'warning',
      sentence: `${n} email outcome${n === 1 ? '' : 's'} could not be read or matched in the last 7 days.`,
      remedy: 'They are in the email events dead-letter queue. If the number grows, Cloudflare may have changed what it sends.',
    }
  },
} satisfies HealthCheck
