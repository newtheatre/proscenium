import { asc, eq } from 'drizzle-orm'

// The register a trainer marks: who is on it, what it teaches, and whether it is open yet.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const resolved = await requireTrainer(event)

  const [session] = await db.select({
    id: schema.trainingSessions.id,
    heldOn: schema.trainingSessions.heldOn,
    startsAt: schema.trainingSessions.startsAt,
    endsAt: schema.trainingSessions.endsAt,
    place: schema.trainingSessions.place,
    status: schema.trainingSessions.status,
    trainerId: schema.trainingSessions.trainerId,
    registerOpenedAt: schema.trainingSessions.registerOpenedAt,
    markedAt: schema.trainingSessions.markedAt,
  })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, id))
    .limit(1)

  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such session' })

  // A register is a list of names, so it is the trainer running it and the officers, nobody else.
  if (session.trainerId !== resolved.account.id && !resolved.permissions.has('training.read')) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
  }

  const modules = await db.select({
    id: schema.trainingModules.id,
    name: schema.trainingModules.name,
  })
    .from(schema.sessionModules)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.sessionModules.moduleId))
    .where(eq(schema.sessionModules.sessionId, id))
    .orderBy(asc(schema.trainingModules.id))

  return { ...session, modules, attendees: await registerFor(id) }
})
