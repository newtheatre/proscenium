// The renewal reminders task last ran (tab 4, core.health-check). It runs daily; two days without a
// finished run while memberships with an end date are live means reminders are not going out.
import { first, nowMs } from '#kit'

const TWO_DAYS = 2 * 86_400_000 // not-policy: a daily task's run plus a day's slack, in milliseconds

export default {
  async check() {
    const live = await first<{ n: number }>("SELECT count(*) AS n FROM membership_memberships WHERE state = 'active' AND ends_on IS NOT NULL")
    if (!live?.n) return { state: 'ok' as const, sentence: 'No membership is waiting for a renewal reminder.' }
    const ran = await first<{ at: number | null }>("SELECT max(finished_at) AS at FROM core_task_runs WHERE task = 'membership.send-reminders'")
    if (!ran?.at || ran.at < nowMs() - TWO_DAYS) return { state: 'warning' as const, sentence: 'Renewal reminders have not been sent for more than a day.', remedy: 'Check the scheduled tasks under Site admin.' }
    return { state: 'ok' as const, sentence: 'Renewal reminders are being sent each day.' }
  },
}
