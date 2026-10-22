import { eq, sql } from 'drizzle-orm'
import { COMMITTEE_ONLY_WORDS } from '#shared/utils/training-action'

// "I have read this": a member records a self-registrable brief for themselves (0244, G-208 c3).
// Idempotent within the day (G-208 c4): the insert is conditional, so a double press adds one.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Say which module you mean' })

  const account = await requireAccount(event)

  const [module] = await db.select({
    id: schema.trainingModules.id,
    kind: schema.trainingModules.kind,
    status: schema.trainingModules.status,
    selfRegistrable: schema.trainingModules.selfRegistrable,
    committeeOnly: schema.trainingModules.committeeOnly,
  })
    .from(schema.trainingModules)
    .where(eq(schema.trainingModules.id, id))
    .limit(1)

  // A draft or retired brief is the same answer as one that never existed, as on its page.
  if (!module || module.status !== 'ACTIVE') throw noSuch('module', 'Go back to the catalogue and open it again')
  if (module.kind !== 'BRIEF' || !module.selfRegistrable) {
    throw createError({ statusCode: 409, statusMessage: 'This one is taught or signed off, so reading it is not enough' })
  }
  if (module.committeeOnly && !(await hasCommitteeRole(account.id))) {
    throw createError({ statusCode: 403, statusMessage: `${COMMITTEE_ONLY_WORDS}: it needs a committee role` })
  }

  const recordId = newId()
  const today = londonToday()
  const entry = auditEntry({
    actorId: account.id,
    action: 'record.self-registered',
    target: `user:${account.id}`,
    detail: { module: id, awardedOn: today },
  })
  const live = sql`(select 1 from training_records
    where user_id = ${account.id} and module_id = ${id} and awarded_on = ${today} and revoked_at is null)`

  await db.batch([
    db.run(sql`
      insert into training_records (id, user_id, module_id, awarded_on, expires_on, source, granted_by)
      select ${recordId}, ${account.id}, ${id}, ${today}, null, 'SELF', ${account.id}
      where not exists ${live}
    `),
    db.run(sql`
      insert into audit_log (id, actor_id, action, target, detail)
      select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      where exists (select 1 from training_records where id = ${recordId})
    `),
  ])

  const [kept] = await db.select({ id: schema.trainingRecords.id })
    .from(schema.trainingRecords)
    .where(eq(schema.trainingRecords.id, recordId))
    .limit(1)

  // False means it was already on their record today, so nothing changed and nothing is wrong.
  return { ok: true, recorded: Boolean(kept) }
})
