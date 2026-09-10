import { reauthOptions } from '#shared/utils/reauthentication'
import type { ReauthOption } from '#shared/utils/reauthentication'
import type { AccountRow } from '#server/utils/accounts'
import type { SessionFactor } from '#shared/utils/session-factor'
import type { H3Event } from 'h3'

// Resolves against the account's current state, not whatever was true when the session opened
// (A-128 criterion 2): a factor removed since is no longer offered, and one added since is.
export async function currentReauthOptions(event: H3Event, account: AccountRow): Promise<ReauthOption[]> {
  const session = await getUserSession(event)
  const factor: SessionFactor = session?.factor ?? 'password'
  const passkeys = await credentialsOf(account.id)

  return reauthOptions({
    factor,
    hasPassword: account.password !== null,
    hasConfirmedTotp: await confirmedFactor(account.id),
    hasPasskey: passkeys.length > 0,
  })
}
