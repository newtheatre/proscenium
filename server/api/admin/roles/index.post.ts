import { z } from 'zod'
import { ROLES } from '#shared/utils/roles'

const body = z.object({
  userId: z.string().min(1).max(64),
  role: z.enum(ROLES),
  // Omitted means the committee year end; explicit null means permanent (0009).
  expiresAt: z.union([z.number().int().positive(), z.null()]).optional(),
})

// Grant a role, expiring at the committee year unless told otherwise.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'roles.grant')
  const input = await readValidatedBodyOrThrow(event, body)

  const subject = await findById(input.userId)
  if (!subject || subject.anonymisedAt !== null) {
    throw createError({ statusCode: 404, statusMessage: 'No such account' })
  }

  const expiresAt = input.expiresAt === undefined ? defaultRoleExpiry(new Date()) : input.expiresAt

  await db.batch([
    db.insert(schema.roleGrants).values({
      id: newId(),
      userId: subject.id,
      role: input.role,
      expiresAt,
      grantedBy: resolved.account.id,
    }).onConflictDoNothing(),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'role.granted',
      target: `user:${subject.id}`,
      detail: { role: input.role, expiresAt, permanent: expiresAt === null },
    })),
  ])

  return { ok: true, role: input.role, expiresAt }
})
