import { eq } from 'drizzle-orm'
import { revokeFellowship as body } from '#shared/utils/admin-forms'

// Revoke a fellowship, rewriting nothing (A-127 criterion 4, 0023).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'fellowships.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, body)

  const [held] = await db.select({ id: schema.fellowships.id, revokedAt: schema.fellowships.revokedAt })
    .from(schema.fellowships).where(eq(schema.fellowships.id, id)).limit(1)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such fellowship' })
  if (held.revokedAt !== null) throw createError({ statusCode: 409, statusMessage: 'That fellowship is already revoked' })

  await db.batch([
    // The award, the date and the citation stand: what a revocation adds is a second fact, not a
    // correction to the first.
    db.update(schema.fellowships).set({
      revokedAt: Math.floor(Date.now() / 1000),
      revokedBy: resolved.account.id,
      revocationReason: input.reason,
    }).where(eq(schema.fellowships.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'fellowship.revoked',
      target: `fellowship:${id}`,
      detail: { fellowship: id },
    })),
  ])

  return { ok: true }
})
