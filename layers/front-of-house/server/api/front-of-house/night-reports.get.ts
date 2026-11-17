// Night reports, newest first: performance, state, who signed off, and counts (FH-32).
import { all, defineRoute } from '#kit'

export default defineRoute({
  ability: 'front-of-house.night-report.view',
  rateLimit: 'default',
}, async () => {
  const rows = await all<{ id: string, performance_id: string, state: string, signed_off_by: string | null, signed_off_at: number | null, created_at: number }>(
    'SELECT id, performance_id, state, signed_off_by, signed_off_at, created_at FROM front_of_house_night_reports ORDER BY created_at DESC LIMIT 200') // not-policy: one screen of reports
  return { reports: rows.map(r => ({ id: r.id, performanceId: r.performance_id, state: r.state, signedOffBy: r.signed_off_by, signedOffAt: r.signed_off_at })) }
})
