// The front of house tile on the Tonight hub (Front of house specification, part 5, "Live mode"):
// today's performances with front of house shifts that this person may see, each with how far the
// night has got and who has arrived, whether they may report
// an incident, and the venues whose emergency card they may open. Open to anyone signed in, since
// authority tonight comes from being on shift; each performance is checked on its own.
import { all, can, defineRoute, first, nowMs, theatreTimeZone } from '#kit'
import { instantOfLocal, localDateOf, previousDate } from '#kit/clock'
import { listCards } from '../../emergency'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const now = nowMs()
  const zone = await theatreTimeZone()
  const day = localDateOf(now, zone)
  const from = instantOfLocal(day, '00:00', zone)
  const to = instantOfLocal(previousDate(day, -1), '00:00', zone)
  // Today's, and any whose window is still open from last night (an extended night runs past midnight).
  const rows = await all<{ id: string, title: string, starts_at: number, venue_id: string | null, venue: string | null }>(
    `SELECT f.id, p.title, f.starts_at, f.venue_id, v.name AS venue FROM core_performances f JOIN core_productions p ON p.id = f.production_id
       LEFT JOIN core_venues v ON v.id = f.venue_id
      WHERE f.state = 'scheduled' AND EXISTS (SELECT 1 FROM front_of_house_shifts s WHERE s.performance_id = f.id AND s.state = 'published'
        AND ((f.starts_at >= ? AND f.starts_at < ?) OR (s.window_opens_at <= ? AND s.window_closes_at >= ?)))
      ORDER BY f.starts_at`, from, to, now, now)
  const performances = []
  for (const r of rows) {
    if (!(await can(actor, 'front-of-house.shift.view', ['core.performance', r.id])).allowed) continue
    // One live figure per tile (NI-7): where the night has got to, and who has arrived.
    const last = await first<{ kind: string }>('SELECT kind FROM front_of_house_timings WHERE performance_id = ? ORDER BY at DESC LIMIT 1', r.id)
    const people = await first<{ expected: number, arrived: number }>(
      `SELECT count(*) AS expected, sum(CASE WHEN a.state = 'checked_in' THEN 1 ELSE 0 END) AS arrived FROM front_of_house_assignments a
        JOIN front_of_house_shifts s ON s.id = a.shift_id WHERE s.performance_id = ? AND s.state = 'published' AND a.state IN ('confirmed', 'release_requested', 'checked_in')`, r.id)
    performances.push({ id: r.id, show: r.title, startsAt: r.starts_at, venueId: r.venue_id, venue: r.venue, last: last?.kind ?? null, expected: Number(people?.expected ?? 0), arrived: Number(people?.arrived ?? 0) })
  }
  const mayReport = (await can(actor, 'front-of-house.incident.report')).allowed
  const cards = (await can(actor, 'front-of-house.emergency-card.view')).allowed
    ? (await listCards()).map(c => ({ venueId: c.venueId, venueName: c.venueName }))
    : []
  return { performances, mayReport, cards }
})
