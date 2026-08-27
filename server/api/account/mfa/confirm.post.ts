import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { verifyCode } from '#shared/utils/totp'

const body = z.object({ code: z.string().min(6).max(20) })

// Confirm the authenticator app, which activates the factor and mints recovery codes.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireFreshSession(event)
  const input = await readValidatedBodyOrThrow(event, body)

  const [enrolment] = await db.select().from(schema.totpSecrets)
    .where(eq(schema.totpSecrets.userId, account.id)).limit(1)

  if (!enrolment) throw createError({ statusCode: 409, statusMessage: 'Start enrolling first' })
  if (enrolment.confirmedAt) throw createError({ statusCode: 409, statusMessage: 'This account already has an authenticator app' })

  const outcome = await verifyCode(enrolment.secret, input.code, new Date(), enrolment.lastUsedStep)
  if (!outcome.accepted) throw createError({ statusCode: 400, statusMessage: 'That code did not match. Try the next one.' })

  await db.batch([
    db.update(schema.totpSecrets)
      .set({ confirmedAt: Math.floor(Date.now() / 1000), lastUsedStep: outcome.step })
      .where(eq(schema.totpSecrets.userId, account.id)),
    // Confirming a first factor ends every other session (A-109 criterion 3).
    db.update(schema.users)
      .set({ sessionEpoch: sql`${schema.users.sessionEpoch} + 1` })
      .where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'mfa.confirmed',
      target: `user:${account.id}`,
    })),
  ])

  // Minted after confirmation, and shown exactly once: nothing stores them in the clear.
  const codes = await mintRecoveryCodes(account.id)

  // The epoch moved, so this session is reissued rather than left stale by its own success.
  const refreshed = await findById(account.id)
  if (refreshed) await startSession(event, refreshed)

  return { ok: true, recoveryCodes: codes }
})
