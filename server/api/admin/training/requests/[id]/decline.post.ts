import { eq, sql } from 'drizzle-orm'
import { requestDeclineForm } from '#shared/utils/training'

// Answer a request. The requester is shown what is written, so it is a reply rather than a
// verdict, and a reason is mandatory (G-104 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No request named' })

  const resolved = await requireCatalogueAuthority(event)
  const input = await readValidatedBodyOrThrow(event, requestDeclineForm)

  const [held] = await db.select({
    id: schema.moduleRequests.id,
    moduleId: schema.moduleRequests.moduleId,
    userId: schema.moduleRequests.userId,
    status: schema.moduleRequests.status,
    department: schema.trainingModules.department,
  })
    .from(schema.moduleRequests)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.moduleRequests.moduleId))
    .where(eq(schema.moduleRequests.id, id))
    .limit(1)

  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such request' })
  await assertStewards(resolved, held.department)

  if (held.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'That request has already been answered' })
  }

  const now = Math.floor(Date.now() / 1000)
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'request.declined',
    target: `request:${id}`,
    // The reason is shown to the requester and never reaches the trail: it is words about a
    // person, and detail carries identifiers (0011).
    detail: { moduleId: held.moduleId },
  })

  const open = sql`(select 1 from module_requests where id = ${id} and status = 'OPEN')`
  await db.batch([
    db.run(sql`
      insert into audit_log (id, actor_id, action, target, detail)
      select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      where exists ${open}
    `),
    db.run(sql`
      update module_requests
      set status = 'DECLINED', reason = ${input.reason}, decided_by = ${resolved.account.id},
        decided_at = ${now}
      where id = ${id} and status = 'OPEN'
    `),
  ])

  return { ok: true }
})
