import { and, eq, isNotNull } from 'drizzle-orm'

// The account's own second-factor state, for the screen that manages it.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)

  const [factor] = await db.select({ confirmedAt: schema.totpSecrets.confirmedAt })
    .from(schema.totpSecrets)
    .where(and(eq(schema.totpSecrets.userId, account.id), isNotNull(schema.totpSecrets.confirmedAt)))
    .limit(1)

  const codes = await db.select({ id: schema.recoveryCodes.id })
    .from(schema.recoveryCodes)
    .where(eq(schema.recoveryCodes.userId, account.id))

  const grants = await liveGrants(account.id)

  return {
    confirmed: Boolean(factor),
    confirmedAt: factor?.confirmedAt ?? null,
    recoveryCodesRemaining: codes.length,
    // Whether giving it up would be refused, so the screen can say so before the button is pressed.
    required: await requiresSecondFactor(event, account, grants),
  }
})
