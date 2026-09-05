import { eq, ne, sql } from 'drizzle-orm'
import { sessionCancelForm } from '#shared/utils/training'

// Call a session off and tell everybody signed up. A cancelled session awards nothing and its
// register can never be opened, so this is only ever the path before one is (G-113).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, sessionCancelForm)

  const [session] = await db.select({
    id: schema.trainingSessions.id,
    heldOn: schema.trainingSessions.heldOn,
    startsAt: schema.trainingSessions.startsAt,
    status: schema.trainingSessions.status,
    trainerId: schema.trainingSessions.trainerId,
    registerOpenedAt: schema.trainingSessions.registerOpenedAt,
  })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, id))
    .limit(1)

  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such session' })

  const mine = session.trainerId === resolved.account.id
  if (!mine && !resolved.permissions.has('training.write')) {
    throw createError({ statusCode: 403, statusMessage: 'Only the trainer running this session may cancel it' })
  }
  if (session.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'That session is already cancelled' })
  }
  // Criterion 5. Once the register is open the session happened, whatever went wrong on the night,
  // so putting it right is the edit window rather than pretending it never ran (G-114).
  if (session.registerOpenedAt !== null) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That register has been opened, so correct the session rather than cancelling it',
    })
  }

  // Criterion 2. Everybody on the list, placed and waiting alike: a waitlisted member would
  // otherwise turn up hoping for a drop-out.
  const signedUp = await db.select({ userId: schema.sessionAttendees.userId })
    .from(schema.sessionAttendees)
    .where(sql`${schema.sessionAttendees.sessionId} = ${id} and ${ne(schema.sessionAttendees.status, 'CANCELLED')}`)

  const now = Math.floor(Date.now() / 1000)

  // The reason is on the session and in the email, and not here: audit detail carries identifiers
  // and never the words somebody wrote about a night (0011).
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'session.cancelled',
    target: `session:${id}`,
    detail: { heldOn: session.heldOn, told: signedUp.length },
  })

  // The audit insert reads `changes()`, this connection's own UPDATE row count, not the
  // resulting state: a losing request's UPDATE touches nothing, whatever the winner did (0049).
  const [cancelled] = await db.batch([
    db.all<{ id: string }>(sql`
      UPDATE training_sessions SET status = 'CANCELLED', cancelled_at = ${now}, cancelled_by = ${resolved.account.id},
        cancel_reason = ${input.reason}, updated_at = ${now}
      WHERE id = ${id} AND status <> 'CANCELLED' RETURNING id
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ])

  // A losing racer is refused, not told it succeeded: the audit stayed silent, so the caller
  // must too (0049).
  if (cancelled.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'That session is already cancelled' })
  }

  // Claimed before it is sent, so a retry of this request cannot tell the same person twice.
  let told = 0
  for (const attendee of signedUp) {
    const key = `training.session.cancelled:${id}:${attendee.userId}`
    const took = await claimNotification({
      userId: attendee.userId,
      type: 'training.session.cancelled',
      key,
      sessionId: id,
    })
    if (!took) continue

    await notify(event, {
      type: 'training.session.cancelled',
      userId: attendee.userId,
      claim: key,
      context: {
        // The recipient's own name is filled in by notify.
        name: '',
        heldOn: session.heldOn,
        reason: input.reason,
        sessionsUrl: `${useRuntimeConfig(event).public.baseURL}/training/sessions`,
      },
    })
    told++
  }

  return { ok: true, told }
})
