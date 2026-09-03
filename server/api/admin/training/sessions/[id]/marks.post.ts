import { eq } from 'drizzle-orm'
import { correctionForm, coverageProblem, daysBetween } from '#shared/utils/training'

// Correct a register that was already marked, inside the window the committee set. Outside it the
// only path is an administrator's revocation and a fresh grant, which is deliberate (G-114).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, correctionForm)

  const [session] = await db.select({
    id: schema.trainingSessions.id,
    heldOn: schema.trainingSessions.heldOn,
    status: schema.trainingSessions.status,
    trainerId: schema.trainingSessions.trainerId,
    markedAt: schema.trainingSessions.markedAt,
  })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, id))
    .limit(1)

  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such session' })

  const mine = session.trainerId === resolved.account.id
  if (!mine && !resolved.permissions.has('training.write')) {
    throw createError({ statusCode: 403, statusMessage: 'Only the trainer running this session may correct its register' })
  }
  if (session.markedAt === null) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This register has not been marked yet, so there is nothing to correct',
    })
  }

  // Criterion 1. The window is configuration, so lengthening it is a settings change rather than
  // a deploy.
  const windowDays = await configValue(event, 'SESSION_EDIT_WINDOW_DAYS')
  if (daysBetween(session.heldOn, londonToday()) > windowDays) {
    throw createError({
      statusCode: 409,
      statusMessage: `That session was held more than ${windowDays} days ago. `
        + 'Correcting it now is an administrator revoking the record and granting it again',
    })
  }

  // The same exact-cover rule marking uses: no strangers, no duplicates, nobody skipped.
  const onRegister = await registerFor(id)
  const problem = coverageProblem(onRegister.map(row => row.userId), input.marks.map(mark => mark.userId))
  if (problem) throw createError({ statusCode: 422, statusMessage: saysCoverage(problem, onRegister) })

  const modules = await modulesTaughtBy(id)
  if (modules.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'This session teaches nothing, so there is nothing to award' })
  }

  const corrected = await correctRegister({
    event,
    sessionId: id,
    heldOn: session.heldOn,
    markedBy: resolved.account.id,
    marks: input.marks,
    modules,
    reason: input.reason,
  })

  // Criterion 3. Somebody dropped by the correction keeps their absence, and hears why nothing
  // landed, the same way they would have on the night.
  await tellAbsentees(event, id, session.heldOn, input.marks)

  return { ok: true, ...corrected }
})
