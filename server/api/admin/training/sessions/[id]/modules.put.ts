import { eq, sql } from 'drizzle-orm'
import { sessionModulesForm } from '#shared/utils/training'

// Change what a session teaches. Opening the register freezes this set, because a mark awards
// records for exactly these modules and the room agreed to them (G-115 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Say which session you mean' })

  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, sessionModulesForm)

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

  if (!session) throw noSuch('session', 'Open the sessions list and choose it again')

  const mine = session.trainerId === resolved.account.id
  if (!mine && !resolved.permissions.has('training.write')) {
    throw createError({ statusCode: 403, statusMessage: 'Only the trainer running this session may change it' })
  }
  if (session.markedAt !== null) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This register has been marked, so its records are the correction path now',
    })
  }

  const frozen = session.registerOpenedAt !== null
  if (frozen && !input.releaseFreeze) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The register is open, so what this session teaches is frozen. Release it deliberately to change it',
    })
  }

  const today = londonToday()
  await assertTeachable(resolved, input.moduleIds, today)
  const lacking = input.tellLacking ? await lackingFor(id, input.moduleIds, today) : []

  // Criterion 2 and question 6's answer. The release is conditional on there being no marks, so a
  // release racing a submission cannot change what a mark is about to award.
  const unmarked = sql`(select 1 from training_sessions where id = ${id} and marked_at is null)`
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: frozen ? 'register.freeze.released' : 'session.modules.changed',
    target: `session:${id}`,
    detail: { modules: input.moduleIds, released: frozen },
  })

  await db.batch([
    db.run(sql`
      insert into audit_log (id, actor_id, action, target, detail)
      select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      where exists ${unmarked}
    `),
    db.run(sql`delete from session_modules where session_id = ${id} and exists ${unmarked}`),
    ...input.moduleIds.map(moduleId => db.run(sql`
      insert into session_modules (id, session_id, module_id)
      select lower(hex(randomblob(16))), ${id}, ${moduleId} where exists ${unmarked}
    `)),
  ])

  // Told only if the change landed: a mark racing it leaves the modules, and nobody, alone.
  const landed = lacking.length === 0
    ? []
    : await db.select({ moduleId: schema.sessionModules.moduleId, name: schema.trainingModules.name })
        .from(schema.sessionModules)
        .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.sessionModules.moduleId))
        .where(eq(schema.sessionModules.sessionId, id))
  const changed = landed.length === input.moduleIds.length && landed.every(row => input.moduleIds.includes(row.moduleId))
  const told = changed ? await tellLacking(event, session, landed, lacking, Date.now()) : 0

  return { ok: true, released: frozen, told }
})
