import { asc, eq } from 'drizzle-orm'
import { daysBetween } from '#shared/utils/training'

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

  // Placed or waiting is derived from the order, never stored, so a trainer marking a full session
  // can see who was only ever on the waitlist (G-105 criterion 2).
  const places = await placesOnSession(id)
  const standing = new Map([...places.places, ...places.waitlisted].map(place => [place.userId, place]))

  const attendees = (await registerFor(id)).map(row => ({
    ...row,
    placed: standing.get(row.userId)?.placed ?? false,
  }))

  const windowDays = await configValue(event, 'SESSION_EDIT_WINDOW_DAYS')
  const correctable = session.markedAt !== null
    && session.status !== 'CANCELLED'
    && daysBetween(session.heldOn, londonToday()) <= windowDays

  return { ...session, modules, attendees, correctable, editWindowDays: windowDays }
})
