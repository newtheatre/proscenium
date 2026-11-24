// What a signed-in person's own screens read: their account, how they sign in, and what to offer.
import { all, credential, first, nowMs, useContext, useSetting } from '#kit'
import { accountById, verifiedAddressesOf } from './accounts'
import type { CurrentSession } from './sessions'
import { authenticatorOf } from './authenticator'
import { managedDomainProvider, offeredProviders } from './providers'
import { holdsPrivileged } from './privileged'

export { holdsPrivileged } from './privileged'

// Does the account still have a way in other than its passkeys (ID-14, "the only way in")?
export async function hasOtherWayIn(accountId: string): Promise<boolean> {
  if (await first('SELECT 1 AS one FROM core_federated_identities WHERE account_id = ? LIMIT 1', accountId)) return true
  if (!(await useSetting('core.sign-in.email-link'))) return false
  const managed = await useSetting('core.sign-in.managed-domains') as string[]
  return (await verifiedAddressesOf(accountId)).some(address => !managed.includes(address.split('@').pop()!))
}

/** Whether the account can sign in strongly at all: a passkey, or an authenticator app where the theatre accepts one as strong. */
export async function strongSignInSetUp(accountId: string): Promise<boolean> {
  const cache = useContext().cache
  const key = `identityStrongSetUp:${accountId}`
  return await ((cache[key] as Promise<boolean> | undefined) ?? (cache[key] = (async () => {
    const passkeys = (await first<{ n: number }>('SELECT count(*) AS n FROM core_passkeys WHERE account_id = ?', accountId))?.n ?? 0
    return passkeys > 0 || (!!(await authenticatorOf(accountId)) && !!(await useSetting('core.sign-in.authenticator-is-strong')))
  })()))
}

// The ways in a signed-out browser is offered, so the page asks for an address first and then shows
// only the buttons that fit it. Passkeys are always on. `email` is true only while an emailed code
// would actually be sent: switched on and the bot check's secret saved. `providers` are the outside
// providers offered, in order, with the organisations each accepts (none: any account). `managed`
// names the domains whose people sign in only through a provider, and that provider. `openSignUp`
// says whether signing in with a new address makes an account, so the page can say so.
export interface SignInMethods {
  email: boolean
  providers: { id: string, label: string, domains: string[] }[]
  managed: { domains: string[], provider: string } | null
  openSignUp: boolean
}

export async function signInMethods(): Promise<SignInMethods> {
  const providers = await offeredProviders()
  const managedDomains = await useSetting('core.sign-in.managed-domains') as string[]
  const managedBy = managedDomainProvider()
  return {
    email: !!(await useSetting('core.sign-in.email-link')) && !!(await credential('CORE_TURNSTILE_SECRET_KEY')),
    providers,
    managed: managedDomains.length && providers.some(p => p.id === managedBy.id) ? { domains: managedDomains, provider: managedBy.id } : null,
    openSignUp: !!(await useSetting('core.sign-in.open-sign-up')),
  }
}

export async function describeMe(session: CurrentSession) {
  const account = await accountById(session.accountId)
  const passkeys = (await first<{ n: number }>('SELECT count(*) AS n FROM core_passkeys WHERE account_id = ?', session.accountId))?.n ?? 0
  const privileged = await holdsPrivileged(session.accountId)
  const addresses = await all<{ id: string, address: string, verified: number }>('SELECT id, address, verified_at IS NOT NULL AS verified FROM core_account_emails WHERE account_id = ? ORDER BY created_at', session.accountId)
  return {
    signedIn: true as const,
    account: { id: session.accountId, name: account?.name ?? null, pronouns: account?.pronouns ?? null },
    addresses: addresses.map(a => ({ id: a.id, address: a.address, verified: !!a.verified })),
    session: { id: session.id, assurance: session.assurance, methods: session.methods, reassertedAt: session.reassertedAt, limited: session.limited },
    passkeys,
    // ID-03: staff holding a privileged ability are told before they meet a refusal.
    // An authenticator app stands in for the passkey where the theatre accepts it as strong.
    consoleNeedsPasskey: privileged && passkeys === 0 && !(await authenticatorOf(session.accountId) && await useSetting('core.sign-in.authenticator-is-strong')),
    // Holding something that needs a strong sign-in while signed in at basic: 'set-up' when nothing
    // is set up to make it strong, 'confirm' when a passkey or the app would. Null when all is well.
    strongerSignIn: privileged && session.assurance !== 'strong' ? (await strongSignInSetUp(session.accountId) ? 'confirm' as const : 'set-up' as const) : null,
    at: nowMs(),
  }
}
