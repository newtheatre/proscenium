import { eq } from 'drizzle-orm'
import { revokeFellowship as body } from '#shared/utils/admin-forms'

// Revoke a fellowship, rewriting nothing (A-127 criterion 4, 0023).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'fellowships.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, body)

  const [held] = await db.select({ id: schema.fellowships.id, userId: schema.fellowships.userId, revokedAt: schema.fellowships.revokedAt })
    .from(schema.fellowships).where(eq(schema.fellowships.id, id)).limit(1)
  if (!held) throw noSuch('fellowship')
  if (held.revokedAt !== null) throw createError({ statusCode: 409, statusMessage: 'That fellowship is already revoked' })

  const entry = auditEntry({ actorId: resolved.account.id, action: 'fellowship.revoked', target: `fellowship:${id}`, detail: { fellowship: id } })
  const revoke = revokeFellowshipStatement(id, resolved.account.id, input.reason, Math.floor(Date.now() / 1000))

  // The read above only words the refusal; the write's own predicate decides a race (0003). The pass
  // cancel follows behind the revocation's own trail row, so a lost race cancels nothing (0049).
  const revoked = await auditedWrite(db.all<{ id: string }>(revoke), entry, db.run(cancelFellowshipPassStatement(held.userId, entry)))

  if (!revoked) throw createError({ statusCode: 409, statusMessage: 'That fellowship is already revoked' })

  return { ok: true }
})
