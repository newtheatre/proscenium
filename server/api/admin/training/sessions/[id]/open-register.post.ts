import { and, eq, isNull } from 'drizzle-orm'
import { registerOpenable } from '#shared/utils/training'

// Open the register. This is the moment a session stops being a plan: the modules freeze and
// sign-up closes (G-115).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const resolved = await requireTrainer(event)

  const [session] = await db.select({
    id: schema.trainingSessions.id,
    heldOn: schema.trainingSessions.heldOn,
    status: schema.trainingSessions.status,
    trainerId: schema.trainingSessions.trainerId,
    registerOpenedAt: schema.trainingSessions.registerOpenedAt,
  })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, id))
    .limit(1)

  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such session' })

  // The trainer running it, or the training officer. Somebody else's register is not yours to open.
  const mine = session.trainerId === resolved.account.id
  if (!mine && !resolved.permissions.has('training.write')) {
    throw createError({ statusCode: 403, statusMessage: 'Only the trainer running this session may open its register' })
  }

  if (session.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'That session was cancelled, so its register can never be opened' })
  }

  // Criterion 1. A record stamps from the held-on date, and a record dated in the future would
  // read as valid to every gate between now and then.
  const today = londonToday()
  if (!registerOpenable(session.heldOn, today)) {
    throw createError({
      statusCode: 422,
      statusMessage: `That session is on ${session.heldOn}. Its register opens on the day, not before`,
    })
  }

  if (session.registerOpenedAt !== null) return { ok: true, alreadyOpen: true }

  // Criterion 4. The stamp is a conditional write, so two devices opening at once produce one open
  // register: the loser's update matches nothing.
  const now = Math.floor(Date.now() / 1000)
  const opened = await db.update(schema.trainingSessions)
    .set({ registerOpenedAt: now, registerOpenedBy: resolved.account.id, updatedAt: now })
    .where(and(eq(schema.trainingSessions.id, id), isNull(schema.trainingSessions.registerOpenedAt)))
    .returning({ id: schema.trainingSessions.id })

  if (opened.length === 0) return { ok: true, alreadyOpen: true }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'register.opened',
    target: `session:${id}`,
    detail: { heldOn: session.heldOn },
  }))

  return { ok: true, alreadyOpen: false }
})
