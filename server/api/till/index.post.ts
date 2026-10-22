import { sql } from 'drizzle-orm'
import { openTillForm, saysReopenNeedsAsking } from '#shared/utils/till'

// Open tonight's till session for a venue, or join the one already open (F-102 criteria 1, 2).
export default defineEventHandler(async (event) => {
  const { reopen, ...scope } = await readValidatedBodyOrThrow(event, openTillForm)
  const resolved = await requireNightAuthority(event, 'BAR', scope)

  // Joining an open session asks nothing; a second one after tonight's close is asked for (0160).
  if (!reopen && !(await openSessionFor(resolved.venueId, resolved.night))) {
    const closed = await lastClosedTonight(resolved.venueId, resolved.night)
    if (closed) throw createError({ statusCode: 409, statusMessage: saysReopenNeedsAsking(await venueNameOf(resolved.venueId), closed), data: { reopen: true } })
  }

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
  if (!session) throw createError({ statusCode: 500, statusMessage: 'That did not save. Try again, and tell the IT Manager if it keeps happening.' })

  return { ok: true, opened: session.id === id, session }
})
