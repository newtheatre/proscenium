import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { PROTECTED_ROLE, ROLES, defaultRoleExpiry } from '#shared/utils/roles'
import { protectedGrantRefusal } from '#shared/utils/protected-role'
import { isWorkspaceEmail, normaliseEmail } from '#shared/utils/auth'
import { PRE_LINKED } from '#shared/utils/pending-grants'
import {
  CONSOLE_ACCOUNT_TAKEN,
  PRELINK_NOT_WORKSPACE,
  PRELINK_OPEN_INSTEAD,
  consoleAccountConstraintRefusal,
  consoleAccountStatements,
  preLinkAddress,
  preLinkDetail,
  preLinkHeldBy,
  preLinkHolderStatement,
  waitingForGoogle,
} from '#shared/utils/google-prelink'
import type { PreLinkHolder } from '#shared/utils/google-prelink'

const body = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(200),
  roles: z.array(z.enum(ROLES)).max(ROLES.length).default([]),
  // The Workspace address their first Google sign-in claims (A-121 criterion 7).
  googleEmail: z.string().trim().email().max(320).optional(),
})

// Why either address already leads to somebody, naming them, or null when both are free.
async function spokenFor(email: string, googleEmail: string | null): Promise<string | null> {
  if (await findByEmail(email)) return CONSOLE_ACCOUNT_TAKEN
  const [waiting] = await db.select({ name: schema.users.name }).from(schema.users)
    .where(eq(schema.users.pendingGoogleEmail, email)).limit(1)
  if (waiting) return waitingForGoogle(waiting.name)
  if (googleEmail === null) return null
  const [holder] = await db.all<PreLinkHolder>(preLinkHolderStatement('', googleEmail))
  return holder ? preLinkHeldBy(holder, PRELINK_OPEN_INSTEAD) : null
}

// Create an account from the console. It never gets a password here (A-121 criterion 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'accounts.create')
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  // Their own address already is what Google matches on, so the same one again links nothing new.
  const given = preLinkAddress(input.googleEmail ?? null)
  const googleEmail = given === email ? null : given
  if (googleEmail !== null && !isWorkspaceEmail(googleEmail)) {
    throw createError({ statusCode: 400, statusMessage: PRELINK_NOT_WORKSPACE })
  }
  const taken = await spokenFor(email, googleEmail)
  if (taken) throw createError({ statusCode: 409, statusMessage: taken })

  if (undeliverableReason({ email, anonymisedAt: null })) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing can be delivered to that address' })
  }

  // Granting a role needs the permission for it, even in the same action as the creation.
  if (input.roles.length > 0 && !resolved.permissions.has('roles.grant')) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to grant roles' })
  }
  // Refused before the account is made, so a refusal leaves nothing half done (A-120 criterion 1).
  if (input.roles.includes(PROTECTED_ROLE)) {
    const refusal = protectedGrantRefusal(await protectedHolders(), { userId: null, expiresAt: defaultRoleExpiry(new Date()), usable: false })
    if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })
  }

  const id = newId()
  const statements = consoleAccountStatements({
    id,
    email,
    name: input.name,
    googleEmail,
    created: auditEntry({ actorId: resolved.account.id, action: 'account.created.console', target: `user:${id}` }),
    prelinked: auditEntry({ actorId: resolved.account.id, action: 'account.google.prelinked', target: `user:${id}`, detail: preLinkDetail(false) }),
  }).map(statement => db.run(statement))
  try {
    await db.batch([statements[0]!, ...statements.slice(1)])
  }
  catch (error) {
    if (!consoleAccountConstraintRefusal(error)) throw error
  }
  // The predicate or a unique index refused it: something landed between the checks and the write.
  if (!await findById(id)) throw createError({ statusCode: 409, statusMessage: await spokenFor(email, googleEmail) ?? PRE_LINKED })

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
  if (!isWorkspaceEmail(email)) await inviteToSetPassword(event, id, input.name)

  return { ok: true, id, invited: !isWorkspaceEmail(email) }
})
