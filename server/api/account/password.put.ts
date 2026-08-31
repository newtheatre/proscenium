import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { passwordProblem } from '#shared/utils/auth'

const body = z.object({
  password: z.string().min(1).max(ABSOLUTE_PASSWORD_LIMIT),
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

  // The epoch is deliberately not bumped: this session proved itself a moment ago, and ending
  // every other one is what a reset is for (A-108).
  await db.batch([
    db.update(schema.users)
      .set({ password: await hashPassword(input.password), passwordSetAt: now })
      .where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: adding ? 'account.method.added' : 'password.set',
      target: `user:${account.id}`,
      detail: { method: 'password' },
    })),
  ])

  return { ok: true, added: adding }
})
