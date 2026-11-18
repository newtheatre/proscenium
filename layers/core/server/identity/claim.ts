// From guest to account (the sign-in review, item 2). A guest buyer already has an unclaimed account,
// made at checkout. This hands them a way to open it: a single-use link that signs them in, and so
// claims the account, exactly as a sign-in link does. It lasts as long as an invitation, and works only
// while the account is still unclaimed, so a forwarded confirmation email stops opening anything the
// moment its owner has signed in once.
import { newId, nowMs, refuse, siteUrl, useSetting, type UnitView } from '#kit'
import { countAgainstRate } from '#kit/ratelimit'
import { configuredOrigin } from '#kit/origin'
import { accountById, canonicalAccount } from './accounts'
import { addressFor } from './addresses'
import { digest, randomToken } from './crypto'
import { notify } from '../notifications/notify'

/** Whether an account has never been signed in to, so a claim link means something. */
export async function isUnclaimed(accountId: string): Promise<boolean> {
  const account = await accountById(await canonicalAccount(accountId))
  return !!account && !account.first_signed_in_at && !account.anonymised_at && !account.disabled_at
}

/**
 * Whether claimLink would give a link for this account now: it is unclaimed, has an address to
 * prove and the site's address is recorded. A page uses it to say a link was sent only when one was.
 */
export async function canSendClaimLink(accountId: string): Promise<boolean> {
  const id = await canonicalAccount(accountId)
  return await isUnclaimed(id) && !!(await addressFor(id, 'audience')) && !!(await configuredOrigin())
}

/**
 * A new claim link for an unclaimed account, written in the caller's unit (pass `madeWith` from
 * findOrCreateAccount for one made in that unit); null when the account is
 * claimed, has no address to prove, or the site's address is not recorded yet. The caller puts it in a sealed variable of an email to that
 * address and nowhere else.
 */
export async function claimLink(unit: UnitView, accountId: string, madeWith?: { address: string } | null): Promise<string | null> {
  // An account findOrCreateAccount made in this same unit is not in the database yet: it is
  // unclaimed, and its address is the one it was made with.
  const id = madeWith ? accountId : await canonicalAccount(accountId)
  if (!madeWith && !(await isUnclaimed(id))) return null
  const address = madeWith ? madeWith.address : await addressFor(id, 'audience')
  // Before the site's address is recorded there is nowhere for the link to point, and an order's
  // confirmation must still go: it goes without one.
  if (!address || !(await configuredOrigin())) return null
  const token = randomToken()
  const at = nowMs()
  const lifetime = await useSetting('core.sign-in.invite-lifetime') as number
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, account_id, address, next_path, attempts, created_at, expires_at)
          VALUES (?, 'claim', ?, ?, ?, '/account', 0, ?, ?)`,
    params: [newId('tok', { random: true }), await digest('link', token), id, address, at, at + lifetime * 1000], // not-policy: seconds to milliseconds
  })
  return siteUrl(`/sign-in/link#${token}`)
}

/**
 * Sends a fresh claim link on its own, for "Send me the link again". `outcome` says what happened, for
 * a caller whose user may know it (whoever holds a booking's link already sees whether its account
 * is open): sent, already claimed, over the limit, or no link can be made (no address, or the
 * site's address is not recorded). Callers that must not
 * say keep answering `sent` alone.
 */
export async function sendClaimLink(unit: UnitView, accountId: string): Promise<{ sent: true, outcome: 'sent' | 'claimed' | 'limited' | 'unavailable' }> {
  const id = await canonicalAccount(accountId)
  if (!(await isUnclaimed(id))) return { sent: true, outcome: 'claimed' }
  if (!(await countAgainstRate('sign-in', `claim:${id}`)).allowed) return { sent: true, outcome: 'limited' }
  const link = await claimLink(unit, id)
  if (link) await notify(unit, 'core.account-claim', { to: id, variables: { link }, dedupeKey: `claim:${id}:${nowMs()}` })
  return { sent: true, outcome: link ? 'sent' : 'unavailable' }
}

/** Refuses a claim link whose account has been signed in to since it was sent. */
export async function checkClaimable(row: { account_id: string | null }): Promise<void> {
  if (!row.account_id || !(await isUnclaimed(row.account_id)))
    refuse('core.sign-in.claim-spent', 'This account has already been opened.', { status: 410, remedy: 'Sign in with your email address instead.' })
}
