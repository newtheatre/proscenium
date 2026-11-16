// Attempts with no answer for longer than payments.attempts.alert-unknown-after (Box office
// specification, part 4, core.health-check).
import { first, nowMs, useSetting } from '#kit'

const SECOND = 1000 // not-policy: milliseconds in a second

export default {
  async check() {
    const after = await useSetting('payments.attempts.alert-unknown-after') as number
    const row = await first<{ n: number }>("SELECT count(*) AS n FROM payments_attempts WHERE state = 'unknown' AND started_at < ?", nowMs() - after * SECOND)
    const n = row?.n ?? 0
    if (n) return { state: 'warning', sentence: `${n === 1 ? 'One payment has' : `${n} payments have`} had no answer from the provider for too long.`, remedy: 'Check them against the provider\'s records under Needs attention.' }
    return { state: 'ok', sentence: 'Every payment has its answer, or is still within the time allowed.' }
  },
} satisfies { check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string }> }
