import { asc, eq } from 'drizzle-orm'
import { methodsOf, refusalToAddPassword, refusalToRemove } from '#shared/utils/sign-in-methods'
import type { MethodSnapshot, SignInMethod } from '#shared/utils/sign-in-methods'
import type { AccountRow } from '#server/utils/accounts'

// The only reader of what an account signs in with. Every removal path goes through
// requireRemovable, so no route can answer differently (A-113 criterion 1).

export async function snapshotFor(account: AccountRow): Promise<MethodSnapshot> {
  const passkeys = await db.select({
    id: schema.passkeys.id,
    label: schema.passkeys.label,
    createdAt: schema.passkeys.createdAt,
    lastUsedAt: schema.passkeys.lastUsedAt,
  })
    .from(schema.passkeys)
    .where(eq(schema.passkeys.userId, account.id))
    .orderBy(asc(schema.passkeys.createdAt))

  return {
    email: account.email,
    passwordSetAt: account.passwordSetAt,
    passwordLastUsedAt: account.passwordLastUsedAt,
    googleSub: account.googleSub,
    googleLinkedAt: account.googleLinkedAt,
    googleLastUsedAt: account.googleLastUsedAt,
    passkeys,
  }
}

export async function listMethods(account: AccountRow): Promise<SignInMethod[]> {
  return methodsOf(await snapshotFor(account))
}

export async function requireRemovable(account: AccountRow, id: string): Promise<void> {
  const refusal = refusalToRemove(await snapshotFor(account), id)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })
}

export function requireCanAddPassword(account: AccountRow): void {
  const refusal = refusalToAddPassword(account)
  if (refusal) throw createError({ statusCode: 400, statusMessage: refusal })
}
