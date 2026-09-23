import { eq } from 'drizzle-orm'
import { capacityChangeStatement, refreshBadgeStatement, sessionCapacityForm } from '#shared/utils/training-signup'

// Change how many places a session has. Raising it promotes whoever the new room reaches, and
// lowering it takes nobody off the list: they go back to waiting and are told (G-106 c1, c6).
export default defineEventHandler(async (event) => {
  const resolved = await requireTrainer(event)
  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'Say which session you mean' })

  const input = await readValidatedBodyOrThrow(event, sessionCapacityForm)

  const session = await sessionForSignUp(sessionId)
  if (!session) throw noSuch('session', 'Open the sessions list and choose it again')

  const [owner] = await db.select({ trainerId: schema.trainingSessions.trainerId })
    .from(schema.trainingSessions).where(eq(schema.trainingSessions.id, sessionId)).limit(1)

  if (!resolved.permissions.has('training.write') && owner?.trainerId !== resolved.account.id) {
    throw createError({ statusCode: 403, statusMessage: 'This is somebody else\'s session to change' })
  }

  // Once the register is open the room is counted rather than planned, and G-114's edit window
  // is the correction path from there.
  if (registerIsOpen(session) || session.status === 'CANCELLED') {
    throw createError({
      statusCode: 409,
      statusMessage: 'This session is past taking sign-ups, so its capacity no longer decides anything',
    })
  }

  const before = await placesOnSession(sessionId)
  if (before.capacity === input.capacity) return { ok: true, capacity: input.capacity, promoted: 0, movedBack: 0 }

  const applied = await auditedWrite(
    db.all<{ id: string }>(capacityChangeStatement(sessionId, before.capacity, input.capacity)),
    auditEntry({
      actorId: resolved.account.id,
      action: 'session.capacity.changed',
      target: `session:${sessionId}`,
      detail: { from: before.capacity, to: input.capacity },
    }),
    // The badge follows the capacity in the same batch, so a session that just gained room never
    // sits reading full and discouraging the sign-ups the trainer made space for.
    db.run(refreshBadgeStatement(sessionId)),
  )
  if (!applied) {
    throw createError({ statusCode: 409, statusMessage: 'That session changed while you were editing it, so open it again' })
  }

  const promoted = await notifyPromotions(event, sessionId, before.places)
  const movedBack = await notifyDemotions(event, sessionId, before.places)
  return { ok: true, capacity: input.capacity, promoted, movedBack }
})
