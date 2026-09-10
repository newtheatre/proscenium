import { sql } from 'drizzle-orm'
import { closeTillSessionForm } from '#shared/utils/reconciliation'
import { saysMoney } from '#shared/utils/bar'

// Close a till session, stamping who and when, and record the expected-versus-actual reader
// figure alongside it: closing is the one write, so both are as append-only as it is (F-118 criterion 3).
export default defineEventHandler(async (event) => {
  // Identity first, so a signed-out caller learns nothing about what exists (E-111 criterion 5).
  await requireAccount(event)

  const { id, actualZPence, varianceNote } = await readValidatedBodyOrThrow(event, closeTillSessionForm)
  const session = await sessionById(id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such till session' })
  if (!isOpen(session)) throw createError({ statusCode: 409, statusMessage: 'That session is already closed' })

  const account = await closerFor(event, session)

  // Recomputed here, never trusted from an earlier preview read: the ledger may have gained a
  // sale between the officer opening the close screen and pressing confirm.
  const bar = await barReconciliation(session.night)
  const variancePence = actualZPence - bar.expectedPence
  if (variancePence !== 0 && !varianceNote) {
    throw createError({
      statusCode: 400,
      statusMessage: `The reader read ${saysMoney(actualZPence)}; the ledger expects ${saysMoney(bar.expectedPence)}. `
        + 'That difference needs a note before it can be recorded.',
    })
  }

  const entry = auditEntry({
    actorId: account.id,
    action: 'bar.till.closed',
    target: `till:${session.venueId}:${session.night}`,
    detail: { venueId: session.venueId, night: session.night, expectedPence: bar.expectedPence, actualZPence, variancePence },
  })

  // The predicate rides the write, so a second close attempt racing this one changes nothing and
  // writes no second audit row for one closure (0001, 0003).
  await db.batch([
    db.run(sql`
      UPDATE till_sessions SET closed_by = ${account.id}, closed_at = unixepoch(),
        expected_total_pence = ${bar.expectedPence}, actual_z_pence = ${actualZPence},
        variance_pence = ${variancePence}, variance_note = ${varianceNote ?? null}
      WHERE id = ${id} AND closed_at IS NULL
    `),
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
