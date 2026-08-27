import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { passwordProblem } from '#shared/utils/auth'

const body = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1).max(ABSOLUTE_PASSWORD_LIMIT),
})

// Set a new password with a reset token.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)

  const claimed = await claimToken(input.token, 'PASSWORD_RESET')
  if (!claimed) {
    throw createError({ statusCode: 410, statusMessage: 'That link has expired or has already been used. Ask for a new one.' })
  }

  const account = await findById(claimed.userId)
  if (!account || account.disabled || account.anonymisedAt !== null) {
    throw createError({ statusCode: 410, statusMessage: 'That link is no longer usable' })
  }

  const problem = passwordProblem(account.email, input.password, await passwordPolicy(event))
  if (problem) throw createError({ statusCode: 400, statusMessage: explainPasswordProblem(problem) })

  await db.batch([
    // Bumping the epoch ends every other session on the account (0007, A-108 criterion 4).
    db.update(schema.users)
      .set({ password: await hashPassword(input.password), verified: true, sessionEpoch: sql`${schema.users.sessionEpoch} + 1` })
      .where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'password.reset',
      target: `user:${account.id}`,
    })),
  ])

  return { ok: true }
})
