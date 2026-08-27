import { z } from 'zod'
import { ROLES, defaultRoleExpiry } from '#shared/utils/roles'
import { isWorkspaceEmail, normaliseEmail } from '#shared/utils/auth'

const body = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(200),
  roles: z.array(z.enum(ROLES)).max(ROLES.length).default([]),
})

// Create an account from the console. It never gets a password here (A-121 criterion 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'accounts.create')
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  if (await findByEmail(email)) {
    throw createError({ statusCode: 409, statusMessage: 'That address already has an account' })
  }

  if (undeliverableReason({ email, anonymisedAt: null })) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing can be delivered to that address' })
  }

  // Granting a role needs the permission for it, even in the same action as the creation.
  if (input.roles.length > 0 && !resolved.permissions.has('roles.grant')) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to grant roles' })
  }

  const id = await createAccount({ email, name: input.name, passwordHash: null, actorId: resolved.account.id })

  if (input.roles.length > 0) {
    const expiresAt = defaultRoleExpiry(new Date())
    await db.batch([
      db.insert(schema.roleGrants).values(input.roles.map(role => ({
        id: newId(),
        userId: id,
        role,
        expiresAt,
        grantedBy: resolved.account.id,
      }))).onConflictDoNothing(),
      db.insert(schema.auditLog).values(auditEntry({
        actorId: resolved.account.id,
        action: 'role.granted',
        target: `user:${id}`,
        detail: { roles: input.roles, expiresAt },
      })),
    ])
  }

  // A Workspace address signs in with Google and can hold no password, so it gets no link.
  if (!isWorkspaceEmail(email)) {
    const { plaintext, expiresAt } = await issueToken(id, 'SET_PASSWORD', await configValue(event, 'ADMIN_TOKEN_HOURS'))
    await notify(event, {
      type: 'account.set-password',
      userId: id,
      context: {
        name: input.name,
        url: `${useRuntimeConfig(event).public.baseURL}/reset?token=${plaintext}&kind=set`,
        expiresAt,
      },
    })
  }

  return { ok: true, id, invited: !isWorkspaceEmail(email) }
})
