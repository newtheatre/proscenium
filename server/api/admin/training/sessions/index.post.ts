import { inArray } from 'drizzle-orm'
import { sessionForm } from '#shared/utils/training'

// Schedule a session. Standing to run one is derived from a current trainer certification, and
// what a trainer may teach is what they hold: scoped by competence, not by department (G-112).
export default defineEventHandler(async (event) => {
  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, sessionForm)

  // Criterion 1. A future date, because a session is scheduled and a past one is G-118's to log.
  const today = londonToday()
  if (input.heldOn <= today) {
    throw createError({
      statusCode: 422,
      statusMessage: 'A session is scheduled for a future day; logging one already delivered is a different act',
    })
  }

  const taught = await db.select({
    id: schema.trainingModules.id,
    name: schema.trainingModules.name,
    status: schema.trainingModules.status,
    kind: schema.trainingModules.kind,
    signoffRequired: schema.trainingModules.signoffRequired,
  }).from(schema.trainingModules).where(inArray(schema.trainingModules.id, input.moduleIds))

  const missing = input.moduleIds.filter(id => !taught.some(module => module.id === id))
  if (missing.length > 0) {
    throw createError({ statusCode: 404, statusMessage: `No such module: ${missing.join(', ')}` })
  }

  // Criteria 3 and 4. A retired module takes nothing new, a draft is not a thing to teach yet, and
  // a sign-off-only module is proved by experience rather than by sitting in a room.
  const refused = taught.filter(module => module.status !== 'ACTIVE' || module.signoffRequired)
  if (refused.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Cannot be taught by session: ${refused.map(module => `${module.id} ${module.name}`).join(', ')}`,
    })
  }

  // Question 4's answer: a trainer teaches what they hold. The training officer is exempt, because
  // they schedule on somebody's behalf rather than teaching it themselves.
  if (!resolved.permissions.has('training.write')) {
    const held = await modulesHeldBy(resolved.account.id, today)
    const unheld = taught.filter(module => !held.has(module.id))
    if (unheld.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: `You do not hold: ${unheld.map(module => `${module.id} ${module.name}`).join(', ')}`,
      })
    }
  }

  const id = newId()
  await db.batch([
    db.insert(schema.trainingSessions).values({
      id,
      heldOn: input.heldOn,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      place: input.place,
      capacity: input.capacity,
      opensAt: input.opensAt,
      // Criterion 2. Open now unless a later instant was named; until then members see nothing.
      status: input.opensAt === null ? 'OPEN' : 'PLANNED',
      notes: input.notes,
      trainerId: resolved.account.id,
    }),
    ...input.moduleIds.map(moduleId => db.insert(schema.sessionModules).values({
      id: newId(),
      sessionId: id,
      moduleId,
    })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'session.scheduled',
      target: `session:${id}`,
      detail: { heldOn: input.heldOn, modules: input.moduleIds, capacity: input.capacity },
    })),
  ])

  // G-104 criterion 4. A session members can see resolves the asks it answers; one they cannot
  // see yet resolves nothing, because nobody can sign up to it.
  const resolvedRequests = input.opensAt === null
    ? await resolveRequestsFor(event, id, input.moduleIds)
    : 0

  return { ok: true, id, resolvedRequests }
})
