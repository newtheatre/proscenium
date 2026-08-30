import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { generateRecoveryCodes, normaliseRecoveryCode } from '#shared/utils/recovery-codes'
import type { AuditRow } from '#shared/utils/audit'
import type { H3Event } from 'h3'

// Enrolment, recovery and the challenge, kept together because minting codes is part of
// confirming a factor and redeeming one is part of answering a challenge.

export const FRESH_SESSION_SECONDS = 10 * 60

async function hashCode(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normaliseRecoveryCode(value)))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

// Enrolling or regenerating needs a session fresher than ten minutes, so a borrowed screen
// cannot quietly add a factor (A-109 criterion 4, A-110 criterion 3).
export async function requireFreshSession(event: H3Event): Promise<void> {
  const session = await getUserSession(event)
  const signedInAt = session?.signedInAt ?? 0
  if (Math.floor(Date.now() / 1000) - signedInAt > FRESH_SESSION_SECONDS) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in again to change your security settings',
      // The screen turns this into one button rather than leaving the person to find the way.
      data: { signInAgain: getRequestURL(event).pathname },
    })
  }
}

// A factor only counts once it has been proven with a code; an unconfirmed enrolment is not a
// second factor (A-109 criterion 2).
export async function confirmedFactor(userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: schema.totpSecrets.userId })
    .from(schema.totpSecrets)
    .where(and(eq(schema.totpSecrets.userId, userId), isNotNull(schema.totpSecrets.confirmedAt)))
    .limit(1)
  return Boolean(row)
}

// Minted whole, and the entry with them: a new set retires the old one in the same batch, which
// is the only atomicity D1 gives us (A-110 criterion 3, 0027).
export async function mintRecoveryCodes(userId: string, entry: AuditRow): Promise<string[]> {
  const codes = generateRecoveryCodes()
  const rows = await Promise.all(codes.map(async code => ({
    id: crypto.randomUUID().replaceAll('-', ''),
    userId,
    codeHash: await hashCode(code),
  })))

  await db.batch([
    db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)),
    db.insert(schema.recoveryCodes).values(rows),
    db.insert(schema.auditLog).values(entry),
  ])

  return codes
}

// A proven first credential waiting on its second factor (A-111).
export async function openAttempt(userId: string, minutes: number, entry: AuditRow): Promise<string> {
  const id = crypto.randomUUID().replaceAll('-', '')
  await db.batch([
    // One outstanding attempt per account: starting again abandons the last.
    db.delete(schema.mfaAttempts).where(eq(schema.mfaAttempts.userId, userId)),
    db.insert(schema.mfaAttempts).values({
      id,
      userId,
      expiresAt: Math.floor(Date.now() / 1000) + minutes * 60,
    }),
    db.insert(schema.auditLog).values(entry),
  ])
  return id
}

// Claimed on sight, right or wrong: a wrong code gets a fresh attempt rather than another go at
// this one, so a typo costs the code and not the password step (A-111).
export async function claimAttempt(id: string): Promise<{ userId: string } | null> {
  const [row] = await db.delete(schema.mfaAttempts)
    .where(eq(schema.mfaAttempts.id, id))
    .returning({ userId: schema.mfaAttempts.userId, expiresAt: schema.mfaAttempts.expiresAt })

  if (!row || row.expiresAt * 1000 <= Date.now()) return null
  return { userId: row.userId }
}

export interface Redemption { redeemed: boolean, remaining: number }

// Delete-as-claim, so one code redeems at most once and only ever answers a challenge, never a
// first credential (A-110). Nothing but the challenge route calls this.
export async function redeemRecoveryCode(userId: string, code: string): Promise<Redemption> {
  const [claimed] = await db.delete(schema.recoveryCodes).where(and(
    eq(schema.recoveryCodes.userId, userId),
    eq(schema.recoveryCodes.codeHash, await hashCode(code)),
  )).returning({ id: schema.recoveryCodes.id })

  const left = await db.select({ id: schema.recoveryCodes.id })
    .from(schema.recoveryCodes)
    .where(eq(schema.recoveryCodes.userId, userId))

  return { redeemed: Boolean(claimed), remaining: left.length }
}

// An unanswered attempt is harmless once it has expired, but it is still a row (A-111).
export async function sweepExpiredAttempts(before: Date): Promise<number> {
  const gone = await db.delete(schema.mfaAttempts)
    .where(lt(schema.mfaAttempts.expiresAt, Math.floor(before.getTime() / 1000)))
    .returning({ id: schema.mfaAttempts.id })
  return gone.length
}
