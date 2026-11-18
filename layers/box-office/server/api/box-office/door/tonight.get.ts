// The door tile on the Tonight hub (live mode): the performances of the theatre's operating day with
// sales set up, each one this person may admit people to. The operating day runs to the theatre's day
// start (core.locale.day-start), so a show that runs past midnight stays at the door (D10). Open to
// anyone signed in; each performance is checked on its own, since the ability to admit may be held
// for one performance only.
import { all, can, defineRoute, nowMs } from '#kit'
import { operatingDayOf } from '#modules/core'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const day = await operatingDayOf(nowMs())
  const rows = await all<{ id: string, title: string, label: string | null, starts_at: number, venue: string | null }>(
    `SELECT f.id, p.title, f.label, f.starts_at, v.name AS venue FROM core_performances f JOIN core_productions p ON p.id = f.production_id
       LEFT JOIN core_venues v ON v.id = f.venue_id
      WHERE f.state = 'scheduled' AND f.operating_day = ?
        AND EXISTS (SELECT 1 FROM box_office_performance_sales s WHERE s.performance_id = f.id)
      ORDER BY f.starts_at`, day)
  const performances = []
  for (const r of rows) {
    if ((await can(actor, 'box-office.ticket.admit', ['core.performance', r.id])).allowed)
      performances.push({ id: r.id, show: r.title, label: r.label, startsAt: r.starts_at, venue: r.venue })
  }
  return { performances }
})
