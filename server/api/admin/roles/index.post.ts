import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { changes } from '#shared/utils/audit'
import { isWorkspaceEmail, normaliseEmail } from '#shared/utils/auth'
import { CHOOSE_INSTEAD, pendingGrantConstraintRefusal, pendingGrantDetail, pendingGrantStatements } from '#shared/utils/pending-grants'
import { ROLES } from '#shared/utils/roles'

// Provenance on the grant, never in the audit trail's detail, which carries identifiers and never
// prose about a person (A-118 criterion 2, 0011).
const MAX_NOTE = 500

// An account is chosen; an address and a name only when the picker found nobody (A-132, 0088).
const body = z.object({
  userId: z.string().min(1).max(64).optional(),
  email: z.string().email().max(320).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  role: z.enum(ROLES),
  // Omitted means the committee year end; explicit null means permanent (0009).
  expiresAt: z.union([z.number().int().positive(), z.null()]).optional(),
  note: z.string().max(MAX_NOTE).optional(),
}).refine(input => (input.userId === undefined) !== (input.email === undefined), { message: 'Choose somebody, or give an address' })
  .refine(input => input.email === undefined || input.name !== undefined, { message: 'Give their name', path: ['name'] })

// Grant a role, expiring at the committee year unless told otherwise.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'roles.grant')
  const input = await readValidatedBodyOrThrow(event, body)

  const expiresAt = input.expiresAt === undefined ? defaultRoleExpiry(new Date()) : input.expiresAt
  const note = input.note?.trim() || null

  if (input.email !== undefined) {
    // Making the account is account creation, whatever screen it was asked from.
    if (!resolved.permissions.has('accounts.create')) {
      throw createError({ statusCode: 403, statusMessage: 'You do not have permission to add somebody' })
    }
    const email = normaliseEmail(input.email)
    const name = input.name!
    // The picker is the way to anybody with an account (K-123 criterion 1).
    if (await findByEmail(email)) throw createError({ statusCode: 409, statusMessage: CHOOSE_INSTEAD })
    if (undeliverableReason({ email, anonymisedAt: null })) {
      throw createError({ statusCode: 400, statusMessage: 'Nothing can be delivered to that address' })
    }

    const userId = newId()
    const statements = pendingGrantStatements({
      userId,
      grantId: newId(),
      email,
      name,
      role: input.role,
      expiresAt,
      note,
      actorId: resolved.account.id,
      entries: {
        created: auditEntry({ actorId: resolved.account.id, action: 'account.created.console', target: `user:${userId}` }),
        granted: auditEntry({
          actorId: resolved.account.id,
          action: 'role.granted',
          target: `user:${userId}`,
          detail: pendingGrantDetail(input.role, expiresAt, note !== null),
        }),
      },
    }).map(statement => db.run(statement))
    try {
      await db.batch([statements[0]!, ...statements.slice(1)])
    }
    catch (error) {
      const refusal = pendingGrantConstraintRefusal(error)
      if (refusal) throw createError(refusal)
      throw error
    }

    // A Workspace address is claimed by Google sign-in alone, so it is sent nothing (0008).
    if (!isWorkspaceEmail(email)) await inviteToSetPassword(event, userId, name)
    return { ok: true, role: input.role, expiresAt, renewed: false, pending: true, userId }
  }

  const subject = await findById(input.userId!)
  if (!subject || subject.anonymisedAt !== null) {
    throw noSuch('account')
  }

  // Putting an expiry on the last administrator is the same act as revoking them, delayed
  // (A-120 criterion 1).
  if (expiresAt !== null && await wouldStrandTheSystem(input.role, subject.id)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That is the last IT Manager: grant another before dating this one',
    })
  }

  // The unique key is (user, role), so a lapsed grant is still a row: without this a renewal
  // would insert nothing, say nothing, and leave the role gone (A-131 criterion 5).
  const [held] = await db.select({
    expiresAt: schema.roleGrants.expiresAt,
    note: schema.roleGrants.note,
  })
    .from(schema.roleGrants)
    .where(and(eq(schema.roleGrants.userId, subject.id), eq(schema.roleGrants.role, input.role)))
    .limit(1)

  await db.batch([
    db.insert(schema.roleGrants).values({
      id: newId(),
      userId: subject.id,
      role: input.role,
      expiresAt,
      grantedBy: resolved.account.id,
      note,
    }).onConflictDoUpdate({
      target: [schema.roleGrants.userId, schema.roleGrants.role],
      // A changed expiry re-arms the lapse warning, which would otherwise never fire again
      // for this grant (A-119 criterion 1).
      set: { expiresAt, grantedBy: resolved.account.id, grantedAt: Math.floor(Date.now() / 1000), note, expiryWarnedAt: null },
    }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: held ? 'role.renewed' : 'role.granted',
      target: `user:${subject.id}`,
      detail: held
        ? { role: input.role, noted: note !== null, ...changes({ expiresAt: [held.expiresAt, expiresAt] }) }
        : { role: input.role, expiresAt, permanent: expiresAt === null, noted: note !== null },
    })),
  ])

  return { ok: true, role: input.role, expiresAt, renewed: Boolean(held), pending: false, userId: subject.id }
})
