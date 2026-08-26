import type { H3Event } from 'h3'
import type { AccountRow } from '#server/utils/accounts'

// Privileged requests re-verify the account every time, so there is no staleness window
// between a revocation and the next request (0007).
export async function currentAccount(event: H3Event): Promise<AccountRow | null> {
  const session = await getUserSession(event)
  const sessionUser = session?.user
  if (!sessionUser?.id) return null

  const account = await findById(sessionUser.id)
  if (!sessionIsCurrent({ epoch: sessionUser.epoch }, account ?? null)) {
    await clearUserSession(event)
    return null
  }
  return account!
}

export async function requireAccount(event: H3Event): Promise<AccountRow> {
  const account = await currentAccount(event)
  if (!account) throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  return account
}

// replaceUserSession, never setUserSession: the latter merges, and defu concatenates arrays, so
// signing in over another session would carry the old one's values forward.
export async function startSession(event: H3Event, account: AccountRow): Promise<void> {
  await replaceUserSession(event, {
    user: { id: account.id, name: account.name, email: account.email, epoch: account.sessionEpoch },
    signedInAt: Math.floor(Date.now() / 1000),
  })
}
