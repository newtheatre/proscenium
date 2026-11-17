// Incidents for reviewers (Front of house specification, part 5, "Incidents"): number, date, kind,
// severity, state and venue, with no free text or people. Search finds an incident by its number.
import { and, count, eq, sql } from 'drizzle-orm'
import { getQuery } from 'h3'
import { all, defineRoute, readListQuery, useDb } from '#kit'
import { incidents } from '../../../db/schema'
import { reference } from '../../../incidents'
import source from '../../../lists/incidents'

// "INC-2027-0004", "2027-4" or just "4" for this year.
const NUMBER = /^(?:INC-)?(?:(\d{4})-)?0*(\d{1,6})$/i // not-policy: the shape an incident number can take

export default defineRoute({ ability: 'front-of-house.incident.view', rateLimit: 'default' }, async (event) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const typed = ((Array.isArray(query.q) ? query.q[0] : query.q) ?? '').trim()
  const read = await readListQuery({ ...query, q: undefined }, source)
  const match = typed ? NUMBER.exec(typed) : null
  const byNumber = match
    ? and(eq(incidents.number, Number(match[2])), match[1] ? eq(incidents.year, Number(match[1])) : undefined)
    : typed ? sql`0` : undefined
  const where = and(read.where(), byNumber)

  const db = useDb()
  const found = await db.select({
    id: incidents.id, year: incidents.year, number: incidents.number, kind: incidents.kind, severity: incidents.severity, state: incidents.state,
    occurredAt: incidents.occurredAt, venueId: incidents.venueId,
    actions: sql<number>`(SELECT count(*) FROM front_of_house_incident_actions a WHERE a.incident_id = ${incidents.id} AND a.state = 'open')`,
  }).from(incidents).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(incidents).where(where) as [{ n: number }]
  const venues = new Map((await all<{ id: string, name: string }>('SELECT id, name FROM core_venues')).map(v => [v.id, v.name]))

  const rows = found.map(r => ({
    id: r.id, reference: reference(r.year, r.number), kind: r.kind, severity: r.severity, state: r.state,
    occurred: r.occurredAt, venue: r.venueId ? venues.get(r.venueId) ?? null : null, actions: r.actions,
  }))
  return { rows, total, dropped: read.dropped }
})
