import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

const form = z.object({
  moduleIds: z.array(z.string().trim().min(1).max(32)).min(1).max(10),
  // Question 6, answered 2 September: the session's own trainer may release the freeze, and only
  // while the register carries no marks.
  releaseFreeze: z.boolean().optional(),
})

// Change what a session teaches. Opening the register freezes this set, because a mark awards
// records for exactly these modules and the room agreed to them (G-115 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, form)

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

  await assertTeachable(resolved, input.moduleIds, londonToday())

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

  return { ok: true, released: frozen }
})
