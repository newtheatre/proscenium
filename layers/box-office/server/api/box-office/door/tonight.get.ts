// The door tile on the Tonight hub (live mode): today's performances with sales set up, each one
// this person may admit people to. Open to anyone signed in; each performance is checked on its own,
// since the ability to admit may be held for one performance only.
import { all, can, defineRoute, nowMs, theatreTimeZone } from '#kit'
import { instantOfLocal, localDateOf, previousDate } from '#kit/clock'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const zone = await theatreTimeZone()
  const day = localDateOf(nowMs(), zone)
  const from = instantOfLocal(day, '00:00', zone)
  const to = instantOfLocal(previousDate(day, -1), '00:00', zone)
  const rows = await all<{ id: string, title: string, label: string | null, starts_at: number, venue: string | null }>(
    `SELECT f.id, p.title, f.label, f.starts_at, v.name AS venue FROM core_performances f JOIN core_productions p ON p.id = f.production_id
       LEFT JOIN core_venues v ON v.id = f.venue_id
      WHERE f.state = 'scheduled' AND f.starts_at >= ? AND f.starts_at < ?
        AND EXISTS (SELECT 1 FROM box_office_performance_sales s WHERE s.performance_id = f.id)
      ORDER BY f.starts_at`, from, to)
  const performances = []
  for (const r of rows) {
    if ((await can(actor, 'box-office.ticket.admit', ['core.performance', r.id])).allowed)
      performances.push({ id: r.id, show: r.title, label: r.label, startsAt: r.starts_at, venue: r.venue })
  }
  return { performances }
})
