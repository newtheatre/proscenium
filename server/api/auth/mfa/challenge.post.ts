import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { verifyCode } from '#shared/utils/totp'

const body = z.object({
  attemptId: z.string().min(10).max(64),
  code: z.string().min(6).max(20),
})

// Answer a second-factor challenge with an authenticator code or a recovery code.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)

  // Claimed on sight: whatever happens next, this attempt is spent.
  const claimed = await claimAttempt(input.attemptId)
  if (!claimed) {
    throw createError({ statusCode: 410, statusMessage: 'That took too long. Sign in again.' })
  }

  const account = await findById(claimed.userId)
  if (!account || account.disabled || account.anonymisedAt !== null) {
    throw createError({ statusCode: 401, statusMessage: 'Those details do not match an account' })
  }

  const [factor] = await db.select().from(schema.totpSecrets)
    .where(eq(schema.totpSecrets.userId, account.id)).limit(1)

  const totp = factor?.confirmedAt
    ? await verifyCode(factor.secret, input.code, new Date(), factor.lastUsedStep)
    : { accepted: false, step: null }

  const recovery = totp.accepted
    ? { redeemed: false, remaining: 0 }
    : await redeemRecoveryCode(account.id, input.code)

  if (!totp.accepted && !recovery.redeemed) {
    // A typo costs the code, not the password step: a fresh attempt is issued (criterion 2).
    const attemptId = await openAttempt(account.id, await configValue(event, 'MFA_ATTEMPT_MINUTES'))
    throw createError({
      statusCode: 401,
      statusMessage: 'That code did not match',
      data: { attemptId },
    })
  }

  await db.batch([
    db.update(schema.users)
      .set({ lastLoginAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.users.id, account.id)),
    // A spent step is recorded so the same code cannot answer a second challenge.
    db.update(schema.totpSecrets)
      .set({ lastUsedStep: totp.accepted ? totp.step : (factor?.lastUsedStep ?? null) })
      .where(eq(schema.totpSecrets.userId, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: totp.accepted ? 'session.started.totp' : 'session.started.recovery-code',
      target: `user:${account.id}`,
      // How many are left is the useful part of a recovery redemption (A-110 criterion 2).
      detail: totp.accepted ? undefined : { remaining: recovery.remaining },
    })),
  ])

  await startSession(event, account)

  return {
    ok: true,
    user: { id: account.id, name: account.name, email: account.email },
    recoveryCodesRemaining: recovery.redeemed ? recovery.remaining : undefined,
  }
})
