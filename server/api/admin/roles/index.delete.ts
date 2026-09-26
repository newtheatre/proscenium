import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { PROTECTED_ROLE, ROLES } from '#shared/utils/roles'

// Query, not body: a DELETE carrying a body hangs the Workers runtime when read (0068).
const query = z.object({
  userId: z.string().min(1).max(64),
  role: z.enum(ROLES),
})

// Revoke a role; the last IT Manager cannot be revoked (A-120). Removing a factor is refused while
// a role requires one, so revoking the role is the way out (A-112 criterion 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'roles.revoke')
  const input = await getValidatedQueryOrThrow(event, query)

  const guard = input.role === PROTECTED_ROLE ? keepsAnItManagerWhere(input.userId, Math.floor(Date.now() / 1000)) : null

  // A role the account does not hold revokes nothing, so it records nothing either (0049).
  await batchKeepingAnItManager(guard, [
    db.delete(schema.roleGrants).where(and(
      eq(schema.roleGrants.userId, input.userId),
      eq(schema.roleGrants.role, input.role),
    )),
    db.run(auditIfChanged(auditEntry({
      actorId: resolved.account.id,
      action: 'role.revoked',
      target: `user:${input.userId}`,
      detail: { role: input.role },
    }))),
  ], () => refuseStranding(input.role, input.userId, 'revoking'))

  return { ok: true }
})
