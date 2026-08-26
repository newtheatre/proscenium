import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { ROLES } from '#shared/utils/roles'

const body = z.object({
  userId: z.string().min(1).max(64),
  role: z.enum(ROLES),
})

// Revoke a role. The last administrator cannot be revoked (A-120).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'roles.revoke')
  const input = await readValidatedBodyOrThrow(event, body)

  if (await wouldStrandTheSystem(input.role, input.userId)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That is the last administrator: grant another before revoking this one',
    })
  }

  await db.batch([
    db.delete(schema.roleGrants).where(and(
      eq(schema.roleGrants.userId, input.userId),
      eq(schema.roleGrants.role, input.role),
    )),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'role.revoked',
      target: `user:${input.userId}`,
      detail: { role: input.role },
    })),
  ])

  return { ok: true }
})
