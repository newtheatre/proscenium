import { and, eq, isNotNull } from 'drizzle-orm'
import { generateRecoveryCodes, normaliseRecoveryCode } from '#shared/utils/recovery-codes'

// Enrolment and recovery, kept together because minting codes is part of confirming a factor.

export const FRESH_SESSION_SECONDS = 10 * 60

async function hashCode(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normaliseRecoveryCode(value)))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

// Enrolling or regenerating needs a session fresher than ten minutes, so a borrowed screen
// cannot quietly add a factor (A-109 criterion 4, A-110 criterion 3).
export async function requireFreshSession(event: Parameters<typeof getUserSession>[0]): Promise<void> {
  const session = await getUserSession(event)
  const signedInAt = session?.signedInAt ?? 0
  if (Math.floor(Date.now() / 1000) - signedInAt > FRESH_SESSION_SECONDS) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in again to change your security settings' })
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

// Minted whole: a new set retires the old one in the same batch, so no window exists in which
// both work (A-110 criterion 3).
export async function mintRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes()
  const rows = await Promise.all(codes.map(async code => ({
    id: crypto.randomUUID().replaceAll('-', ''),
    userId,
    codeHash: await hashCode(code),
  })))

  await db.batch([
    db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)),
    db.insert(schema.recoveryCodes).values(rows),
  ])

  return codes
}

export interface Redemption { redeemed: boolean, remaining: number }

// Redeems one code, at most once. Delete-as-claim, so two attempts with the same code cannot
// both succeed (A-110 criterion 2).
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
