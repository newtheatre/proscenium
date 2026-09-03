import { eq } from 'drizzle-orm'
import { coverageProblem, markForm } from '#shared/utils/training'

// Mark the register. This is the single act that awards a record for a taught session: there is no
// other path from attending to holding, and there never will be (G-116).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, markForm)

  const [session] = await db.select({
    id: schema.trainingSessions.id,
    heldOn: schema.trainingSessions.heldOn,
    status: schema.trainingSessions.status,
    trainerId: schema.trainingSessions.trainerId,
    registerOpenedAt: schema.trainingSessions.registerOpenedAt,
    markedAt: schema.trainingSessions.markedAt,
  })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, id))
    .limit(1)

  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such session' })

  const mine = session.trainerId === resolved.account.id
  if (!mine && !resolved.permissions.has('training.write')) {
    throw createError({ statusCode: 403, statusMessage: 'Only the trainer running this session may mark its register' })
  }
  if (session.registerOpenedAt === null) {
    throw createError({ statusCode: 409, statusMessage: 'The register is not open yet' })
  }
  if (session.markedAt !== null) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This register has already been marked. Correcting it is the edit window, not a second mark',
    })
  }

  const onRegister = await registerFor(id)
  const problem = coverageProblem(onRegister.map(row => row.userId), input.marks.map(mark => mark.userId))
  if (problem) throw createError({ statusCode: 422, statusMessage: saysCoverage(problem, onRegister) })

  // Criterion 2. Everybody absent is a real answer and a suspicious one, so it is confirmed rather
  // than refused: a whole session that nobody came to is worth pausing over.
  const present = input.marks.filter(mark => mark.mark === 'ATTENDED')
  if (present.length === 0 && !input.confirmedAllAbsent) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Nobody is marked present. If that is right, confirm it and the session will award nothing',
    })
  }

  const modules = await modulesTaughtBy(id)
  if (modules.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'This session teaches nothing, so there is nothing to award' })
  }

  // Criteria 3, 4 and 5. One batch, guarded on the register still being unmarked, and every record
  // dated to the day of the session rather than the day it was marked.
  const marked = await markRegister({
    event,
    sessionId: id,
    heldOn: session.heldOn,
    markedBy: resolved.account.id,
    marks: input.marks,
    modules,
  })

  if (!marked.won) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Somebody marked this register while you were marking it, and theirs landed first',
    })
  }

  await tellAbsentees(event, id, session.heldOn, input.marks)
  return { ok: true, awarded: marked.awarded, present: present.length, absent: input.marks.length - present.length }
})
