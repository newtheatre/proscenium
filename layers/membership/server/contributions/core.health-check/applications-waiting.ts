// Applications waiting on staff for more than seven days (Membership specification, tab 4, core.health-check).
import { first, nowMs } from '#kit'

const WEEK = 7 * 86_400_000 // not-policy: the specification's fixed threshold, a week in milliseconds

export default {
  async check() {
    const row = await first<{ n: number }>("SELECT count(*) AS n FROM membership_memberships WHERE state = 'pending' AND needs_verification = 1 AND verified_at IS NULL AND created_at < ?", nowMs() - WEEK)
    const n = row?.n ?? 0
    if (n) return { state: 'warning' as const, sentence: `${n === 1 ? 'One membership application has' : `${n} membership applications have`} waited for a check for more than a week.`, remedy: 'Pass or decline them under Membership, Applications.' }
    return { state: 'ok' as const, sentence: 'No membership application has waited for a check for more than a week.' }
  },
}
