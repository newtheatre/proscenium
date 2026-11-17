// What a signed-in person's own screens read: their account, how they sign in, and what to offer.
import { all, first, nowMs, useSetting } from '#kit'
import { useRegistry } from '#kit/registry'
import { accountById, verifiedAddressesOf } from './accounts'
import { kitGrantsOf } from './grants'
import type { CurrentSession } from './sessions'
import { authenticatorOf } from './authenticator'
import { offeredProviders } from './providers'

// Does the account still have a way in other than its passkeys (ID-14, "the only way in")?
export async function hasOtherWayIn(accountId: string): Promise<boolean> {
  if (await first('SELECT 1 AS one FROM core_federated_identities WHERE account_id = ? LIMIT 1', accountId)) return true
  if (!(await useSetting('core.sign-in.email-link'))) return false
  const managed = await useSetting('core.sign-in.managed-domains') as string[]
  return (await verifiedAddressesOf(accountId)).some(address => !managed.includes(address.split('@').pop()!))
}

// Whether this person holds any privileged ability, so the console will want a passkey (ID-03).
export async function holdsPrivileged(accountId: string): Promise<boolean> {
  const registry = useRegistry()
  return (await kitGrantsOf(accountId)).some(g => g.ability && registry.abilities.get(g.ability)?.decl.risk === 'privileged')
}

// The ways in a signed-out browser is offered. Passkeys are always on.
// `providers` are the outside providers offered, in order, each with its id (the path segment) and label.
export async function signInMethods(): Promise<{ email: boolean, providers: { id: string, label: string }[] }> {
  return { email: !!(await useSetting('core.sign-in.email-link')), providers: await offeredProviders() }
}

export async function describeMe(session: CurrentSession) {
  const account = await accountById(session.accountId)
  const passkeys = (await first<{ n: number }>('SELECT count(*) AS n FROM core_passkeys WHERE account_id = ?', session.accountId))?.n ?? 0
  const privileged = await holdsPrivileged(session.accountId)
  const addresses = await all<{ id: string, address: string, verified: number }>('SELECT id, address, verified_at IS NOT NULL AS verified FROM core_account_emails WHERE account_id = ? ORDER BY created_at', session.accountId)
  return {
    signedIn: true as const,
    account: { id: session.accountId, name: account?.name ?? null, preferredName: account?.preferred_name ?? null, pronouns: account?.pronouns ?? null },
    addresses: addresses.map(a => ({ id: a.id, address: a.address, verified: !!a.verified })),
    session: { id: session.id, assurance: session.assurance, methods: session.methods, reassertedAt: session.reassertedAt, limited: session.limited },
    passkeys,
    // ID-03: staff holding a privileged ability are told before they meet a refusal.
    // An authenticator app stands in for the passkey where the theatre accepts it as strong.
    consoleNeedsPasskey: privileged && passkeys === 0 && !(await authenticatorOf(session.accountId) && await useSetting('core.sign-in.authenticator-is-strong')),
    at: nowMs(),
  }
}
