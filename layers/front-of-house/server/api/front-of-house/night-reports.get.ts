// Night reports, newest first: performance, state, who signed off, and counts of checklist
// exceptions and incidents from the signed snapshot (FH-32).
import { all, defineRoute } from '#kit'
import { accountLabel } from '#modules/core'
import type { Snapshot } from '../../reports'

export default defineRoute({
  ability: 'front-of-house.night-report.view',
  rateLimit: 'default',
}, async () => {
  const rows = await all<{ id: string, performance_id: string, state: string, signed_off_by: string | null, signed_off_at: number | null, snapshot: string | null, title: string | null, starts_at: number | null }>(
    `SELECT n.id, n.performance_id, n.state, n.signed_off_by, n.signed_off_at, n.snapshot, p.title, f.starts_at
       FROM front_of_house_night_reports n LEFT JOIN core_performances f ON f.id = n.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
      ORDER BY n.created_at DESC LIMIT 200`) // not-policy: one screen of reports
  const reports = []
  for (const r of rows) {
    const snapshot = r.snapshot ? JSON.parse(r.snapshot) as Snapshot : null
    reports.push({
      id: r.id, performanceId: r.performance_id, state: r.state, signedOffBy: r.signed_off_by, signedOffAt: r.signed_off_at,
      signedOffByName: r.signed_off_by ? await accountLabel(r.signed_off_by) : null,
      show: r.title, startsAt: r.starts_at,
      exceptions: snapshot ? snapshot.checklists.reduce((n, c) => n + c.exceptions.length, 0) : null,
      incidents: snapshot ? snapshot.incidents.length : null,
    })
  }
  return { reports }
})
