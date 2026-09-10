import { sql } from 'drizzle-orm'
import { recordZReadingForm, zReadingConstraintRefusal } from '#shared/utils/night-reconciliation'

// Records the night's actual Z reading against the ledger's own expected figure, recomputed here
// and never trusted from an earlier read (I-104 criteria 2, 3; the same discipline F-118 keeps).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.write')
  const input = await readValidatedBodyOrThrow(event, recordZReadingForm)

  const prepared = await prepareZReading(input, resolved.account.id)

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'finance.z-reading.recorded',
    target: `z-reading:${input.night}`,
    detail: {
      night: input.night,
      readerPence: input.readerPence,
      expectedPence: prepared.expectedPence,
      variancePence: prepared.variancePence,
      writtenOff: input.writtenOff,
    },
  })

  try {
    // The predicate rides the write, so a loser writes no audit row for a reading it never
    // recorded (0001, 0003).
    await db.batch([
      db.run(prepared.statement),
      db.run(sql`
        INSERT INTO audit_log (id, actor_id, action, target, detail)
        SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
        WHERE changes() = 1
      `),
    ])
  }
  catch (error) {
    const refusal = zReadingConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }

  const current = await currentReading(input.night)
  if (!current || current.id !== prepared.id) {
    throw createError({
      statusCode: 409,
      statusMessage: input.supersedesId
        ? 'That reading is no longer the live one for this night'
        : 'Somebody else just recorded this night\'s first reading',
    })
  }

  return { ok: true, id: prepared.id, expectedPence: prepared.expectedPence, variancePence: prepared.variancePence }
})
