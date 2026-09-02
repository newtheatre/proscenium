import { sql } from 'drizzle-orm'
import { revokeForm } from '#shared/utils/training'

// Take a record away. Administrator only, a reason always, and never a deletion: the row stays and
// stops counting, because revoke plus re-grant is the whole correction path (G-122).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'training.revoke')
  const input = await readValidatedBodyOrThrow(event, revokeForm)

  const record = await recordById(id)
  if (!record) throw createError({ statusCode: 404, statusMessage: 'No such record' })

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'record.revoked',
    target: `user:${record.userId}`,
    // The reason is never in the trail: audit detail carries identifiers and never people (0011).
    detail: { record: id, module: record.moduleId },
  })

  // Criterion 3: idempotent by predicate, so two administrators racing leave one stamp and one
  // entry. The entry goes first, or the update in the same batch falsifies the guard it rides on.
  const unrevoked = sql`(select 1 from training_records where id = ${id} and revoked_at is null)`
  await db.batch([
    db.run(sql`
      insert into audit_log (id, actor_id, action, target, detail)
      select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      where exists ${unrevoked}
    `),
    db.run(sql`
      update training_records
      set revoked_at = ${Math.floor(Date.now() / 1000)}, revoked_by = ${resolved.account.id},
          revoke_reason = ${input.reason}
      where id = ${id} and revoked_at is null
    `),
  ])

  return { ok: true }
})
