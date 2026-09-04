import { sql } from 'drizzle-orm'
import { closeTillSessionForm } from '#shared/utils/till'
import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'

// Tonight's session closes under the same authority that opened it; a night that has ended has
// no shift left to fall back on, so only the standing officer role reaches back for it (F-102 criterion 5).
async function closerFor(event: H3Event, session: { venueId: string, night: string }): Promise<AccountRow> {
  if (session.night === currentShowNight()) {
    return (await requireNightAuthority(event, 'BAR', { venueId: session.venueId })).account
  }

  const resolved = await authority(event)
  if (!resolved.permissions.has('night.till')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'A session from an earlier night needs the bar manager\'s role to close',
    })
  }
  await requireSecondFactorIfPrivileged(event, resolved)
  return resolved.account
}

// Close a till session, stamping who and when. The expected reconciliation figure is F-118's,
// which needs sales that do not exist yet (F-102 criterion 4).
export default defineEventHandler(async (event) => {
  // Identity first, so a signed-out caller learns nothing about what exists (E-111 criterion 5).
  await requireAccount(event)

  const { id } = await readValidatedBodyOrThrow(event, closeTillSessionForm)
  const session = await sessionById(id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such till session' })
  if (!isOpen(session)) throw createError({ statusCode: 409, statusMessage: 'That session is already closed' })

  const account = await closerFor(event, session)

  const entry = auditEntry({
    actorId: account.id,
    action: 'bar.till.closed',
    target: `till:${session.venueId}:${session.night}`,
    detail: { venueId: session.venueId, night: session.night },
  })

  // The predicate rides the write, so a second close attempt racing this one changes nothing and
  // writes no second audit row for one closure (0001, 0003).
  await db.batch([
    db.run(sql`UPDATE till_sessions SET closed_by = ${account.id}, closed_at = unixepoch() WHERE id = ${id} AND closed_at IS NULL`),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ])

  const after = await sessionById(id)
  if (!after || isOpen(after)) {
    throw createError({ statusCode: 409, statusMessage: 'That session is already closed' })
  }

  return { ok: true, session: after }
})
