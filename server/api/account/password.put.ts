import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { passwordProblem } from '#shared/utils/auth'

const body = z.object({
  password: z.string().min(1, 'Choose a password').max(ABSOLUTE_PASSWORD_LIMIT, 'That is too long'),
  // Ticked by default on the screen: somebody changing a password often suspects misuse (0154).
  signOutOthers: z.boolean().default(false),
})

// Set or replace this account's password.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireFreshSession(event)
  requireCanAddPassword(account)

  const input = await readValidatedBodyOrThrow(event, body)
  const problem = passwordProblem(account.email, input.password, await passwordPolicy(event))
  if (problem) throw createError({ statusCode: 400, statusMessage: explainPasswordProblem(problem) })

  const adding = account.passwordSetAt === null
  const now = Math.floor(Date.now() / 1000)

  // Ending the other sessions is the owner's choice, or forced while an address change waits, since
  // that is the owner answering its warning; this session is re-sealed and carries on (0154, 0151).
  const signsOut = input.signOutOthers || await pendingEmail(account) !== null
  const others = signsOut ? { sessionEpoch: sql`${schema.users.sessionEpoch} + 1` } : {}
  await db.batch([
    db.update(schema.users)
      .set({ password: await hashPassword(input.password), passwordSetAt: now, ...others })
      .where(eq(schema.users.id, account.id)),
    cancelPendingEmailChange(account),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: adding ? 'account.method.added' : 'password.set',
      target: `user:${account.id}`,
      detail: signsOut ? { method: 'password', sessions: 'others' } : { method: 'password' },
    })),
  ])
  if (signsOut) await resealSession(event, (await findById(account.id))!)

  return { ok: true, added: adding }
})
