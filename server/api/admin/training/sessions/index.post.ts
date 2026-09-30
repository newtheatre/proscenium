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

  // G-112 as amended (issue 1336): the scheduler names who teaches. A trainer schedules their own
  // sessions; only the Theatre Manager names somebody else, who must hold trainer standing.
  const teacher = await namedTeacher(resolved, input.trainerId, today)

  // Criteria 3 and 4, and question 4's answer. Shared with the retrospective log, which refuses
  // the same modules for the same reasons (G-118).
  await assertTeachable(resolved, input.moduleIds, today, teacher)
  const trainerId = teacher?.id ?? resolved.account.id

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
      description: input.description,
      notes: input.notes,
      trainerId,
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
      detail: { heldOn: input.heldOn, modules: input.moduleIds, capacity: input.capacity, trainer: trainerId },
    })),
  ])

  // G-104 criterion 4. A session members can see resolves the asks it answers; one they cannot
  // see yet resolves nothing, because nobody can sign up to it.
  const resolvedRequests = input.opensAt === null
    ? await resolveRequestsFor(event, id, input.moduleIds)
    : 0

  return { ok: true, id, resolvedRequests }
})
