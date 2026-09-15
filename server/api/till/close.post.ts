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

  // Money may still be arriving on the reader for a hand-off nobody has answered for; the Z
  // cannot be reconciled around it (F-124 criterion 6). A mismatch is a fact, not a wait.
  const waiting = await openAttemptCount(session.night, session.venueId)
  if (waiting > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${waiting} SumUp ${waiting === 1 ? 'payment is' : 'payments are'} still waiting for an answer. Resolve ${waiting === 1 ? 'it' : 'them'} on the till first.`,
    })
  }

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

  // Both predicates ride the write, so a second close attempt and a hand-off started since the
  // count above change nothing and write no second audit row for one closure (0001, 0003).
  const closed = await auditedWrite(db.all(closeSessionStatement({
    id,
    venueId: session.venueId,
    night: session.night,
    closedBy: account.id,
    expectedPence: bar.expectedPence,
    actualZPence,
    variancePence,
    varianceNote: varianceNote ?? null,
  })), entry)

  const after = await sessionById(id)
  // This caller's own answer, not what the row happens to say: a loser here had their Z figure
  // and their note thrown away, and must not be told the close went through (F-118 criterion 3).
  if (!closed) {
    throw createError({
      statusCode: 409,
      statusMessage: after && !isOpen(after)
        ? 'Somebody else closed this session first, so this reading was not recorded. Read the till before recording anything.'
        : 'A SumUp payment landed while this close was in flight, so nothing was recorded. Answer it on the till and close again.',
    })
  }
  if (!after) throw createError({ statusCode: 409, statusMessage: 'That session is no longer there' })

  return { ok: true, session: after }
})
