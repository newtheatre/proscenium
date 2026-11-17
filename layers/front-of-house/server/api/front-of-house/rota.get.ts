// The rota at a glance (Front of house specification, part 5, "Rota"): scheduled performances from
// a day on, with a line for each duty of places filled of places wanted and how many shifts are
// still drafts. A performance in a space the theatre does not manage is marked, so bulk actions
// skip it.
import { z } from 'zod'
import { all, defineRoute, nowMs } from '#kit'

const LIMIT = 120 // not-policy: one screen of performances

export default defineRoute({
  ability: 'front-of-house.shift.view',
  rateLimit: 'default',
  input: z.object({
    from: z.coerce.number().int().nonnegative().optional(),
    venueId: z.string().min(1).max(40).optional(), // not-policy: shape bound
    unfilled: z.enum(['1']).optional(),
  }),
}, async (_event, { input }) => {
  const performances = await all<{ id: string, title: string, starts_at: number, venue: string | null, venue_id: string | null, managed: number | null }>(
    `SELECT f.id, p.title, f.starts_at, v.name AS venue, f.venue_id, s.managed FROM core_performances f JOIN core_productions p ON p.id = f.production_id
       LEFT JOIN core_venues v ON v.id = f.venue_id LEFT JOIN core_spaces s ON s.id = f.space_id
      WHERE f.state = 'scheduled' AND f.starts_at >= ?1 AND (?2 IS NULL OR f.venue_id = ?2) ORDER BY f.starts_at LIMIT ?3 -- not-policy: numbered parameters
      `, input.from ?? nowMs(), input.venueId ?? null, LIMIT)
  const lines = performances.length
    ? await all<{ performance_id: string, duty_id: string, duty: string, places: number, taken: number, drafts: number }>(
        `SELECT s.performance_id, s.duty_id, d.name AS duty, sum(s.places) AS places, sum(s.places_taken) AS taken, sum(s.state = 'draft') AS drafts
           FROM front_of_house_shifts s JOIN front_of_house_duties d ON d.id = s.duty_id
          WHERE s.state <> 'cancelled' AND s.performance_id IN (SELECT value FROM json_each(?))
          GROUP BY s.performance_id, s.duty_id ORDER BY d.sort_order, d.name`, JSON.stringify(performances.map(p => p.id)))
    : []
  const rows = performances.map((p) => {
    const duties = lines.filter(l => l.performance_id === p.id).map(l => ({ dutyId: l.duty_id, duty: l.duty, places: l.places, taken: l.taken, drafts: l.drafts }))
    return { id: p.id, show: p.title, startsAt: p.starts_at, venue: p.venue, managed: p.managed !== 0, duties }
  })
  return { performances: input.unfilled ? rows.filter(r => !r.duties.length || r.duties.some(d => d.taken < d.places)) : rows }
})
