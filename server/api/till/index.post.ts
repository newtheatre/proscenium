import { sql } from 'drizzle-orm'
import { tillScopeForm } from '#shared/utils/till'

// Open tonight's till session for a venue, or join the one already open (F-102 criteria 1, 2).
export default defineEventHandler(async (event) => {
  const scope = await readValidatedBodyOrThrow(event, tillScopeForm)
  const resolved = await requireNightAuthority(event, 'BAR', scope)

  const id = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.till.opened',
    target: `till:${resolved.venueId}:${resolved.night}`,
    detail: { venueId: resolved.venueId, night: resolved.night },
  })

  // A losing racer's INSERT changes nothing, so `changes()` reads 0 and it writes no audit row
  // either: the partial index is the only *open* session that can ever exist here (0001, 0003).
  await db.batch([
    db.run(sql`
      INSERT INTO till_sessions (id, venue_id, night, opened_by)
      VALUES (${id}, ${resolved.venueId}, ${resolved.night}, ${resolved.account.id})
      ON CONFLICT (venue_id, night) WHERE closed_at IS NULL DO NOTHING
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ])

  const session = await openSessionFor(resolved.venueId, resolved.night)
  if (!session) throw createError({ statusCode: 500, statusMessage: 'The session did not open' })

  return { ok: true, opened: session.id === id, session }
})
