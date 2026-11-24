// Signing in with an outside provider (ID-04): the OpenID Connect code flow with PKCE, state and a
// nonce, carried between the redirect and the callback in a sealed cookie. Which provider is a
// parameter (`providers.ts`); nothing here is particular to one. The ID token comes straight from the
// provider's token endpoint over TLS, so its signature is not checked again (OpenID Connect Core
// 3.1.3.7); its issuer, audience, expiry, nonce, verified email and organisation are.
import type { H3Event } from 'h3'
import { first, newId, nowMs, refuse, useSetting, credential, siteUrl, type UnitView } from '#kit'
import { base64url, fromBase64url, openValue, randomToken, sealValue } from './crypto'
import { PROVIDER_COOKIE, PROVIDER_LINK_COOKIE, clearCookie, readCookie, setShortCookie } from './web'
import { accountById, accountForProvenAddress, addressRow, domainOf, normaliseAddress } from './accounts'
import { startSession, type Method } from './sessions'
import { PROVIDERS, labelOf, managingProvider, type SignInProvider } from './providers'

const FLOW_LIFETIME = 10 * 60 // not-policy: seconds a person has to finish at the provider

interface Flow { provider: string, state: string, nonce: string, verifier: string, next: string | null }

export interface ProviderClaims { iss: string, aud: string | string[], exp: number, sub: string, email?: string, email_verified?: boolean, nonce?: string, name?: string, [claim: string]: unknown }

async function clientId(provider: SignInProvider): Promise<string> {
  if (!(await useSetting(provider.settings.on))) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const id = await useSetting(provider.settings.clientId) as string | null
  if (!id) refuse('core.sign-in.provider-unavailable', `${await labelOf(provider)} sign-in is not set up yet.`, { status: 503 })
  return id
}

/** Where the provider sends the browser back to, on the site's one origin. */
async function callbackUrl(provider: SignInProvider): Promise<string> {
  return siteUrl(`/api/core/sign-in/${provider.id}/callback`)
}

/** The organisation an ID token names (Google's `hd`), lower-cased, or null. */
function organisationOf(provider: SignInProvider, claims: ProviderClaims): string | null {
  if (!provider.organisation) return null
  const value = claims[provider.organisation.claim]
  return typeof value === 'string' && value ? value.toLowerCase() : null
}

/** The address to send the browser to, at the provider. */
export async function startProvider(event: H3Event, provider: SignInProvider, input: { next: string | null, loginHint?: string }): Promise<string> {
  const client = await clientId(provider)
  const { authoriseUrl } = await provider.endpoints()
  const flow: Flow = { provider: provider.id, state: randomToken(), nonce: randomToken(), verifier: randomToken(), next: input.next }
  setShortCookie(event, PROVIDER_COOKIE, await sealValue('provider', flow), FLOW_LIFETIME)
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flow.verifier))))
  const domains = await useSetting(provider.settings.domains) as string[]
  const query = new URLSearchParams({
    client_id: client, redirect_uri: await callbackUrl(provider), response_type: 'code', scope: provider.scope,
    state: flow.state, nonce: flow.nonce, code_challenge: challenge, code_challenge_method: 'S256', ...provider.extra,
  })
  if (domains.length === 1 && provider.organisation?.hint) query.set(provider.organisation.hint, domains[0]!)
  if (input.loginHint) query.set('login_hint', input.loginHint)
  return `${authoriseUrl}?${query}`
}

function decodeClaims(label: string, idToken: string): ProviderClaims {
  const payload = idToken.split('.')[1]
  const failed = () => refuse('core.sign-in.provider-failed', `${label} did not confirm who you are.`, { status: 422, remedy: 'Try again.' })
  if (!payload) failed()
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload!))) as ProviderClaims
    return claims && typeof claims === 'object' ? claims : failed()
  }
  catch {
    return failed()
  }
}

/** Swaps the code for the provider's verdict, and checks it. */
export async function finishProvider(event: H3Event, provider: SignInProvider, input: { code: string, state: string }): Promise<{ claims: ProviderClaims, next: string | null }> {
  const client = await clientId(provider)
  const label = await labelOf(provider)
  const flow = await openValue<Flow>('provider', readCookie(event, PROVIDER_COOKIE))
  clearCookie(event, PROVIDER_COOKIE)
  if (!flow || flow.provider !== provider.id || flow.state !== input.state) refuse('core.sign-in.provider-failed', `${label} sign-in took too long, or was started in another browser.`, { status: 422, remedy: 'Try again.' })
  const secret = await credential(provider.secret)
  if (!secret) refuse('core.sign-in.provider-unavailable', `${label} sign-in is not set up yet.`, { status: 503 })
  const response = await fetch((await provider.endpoints()).tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: input.code, client_id: client, client_secret: secret, redirect_uri: await callbackUrl(provider), grant_type: 'authorization_code', code_verifier: flow.verifier }),
  })
  const body = await response.json().catch(() => ({})) as { id_token?: string }
  if (!response.ok || !body.id_token) refuse('core.sign-in.provider-failed', `${label} did not confirm who you are.`, { status: 422, remedy: 'Try again.' })
  const claims = decodeClaims(label, body.id_token)
  const audience = Array.isArray(claims.aud) ? claims.aud.includes(client) : claims.aud === client
  const valid = typeof claims.iss === 'string' && await provider.issuerMatches(claims) && audience && claims.exp * 1000 > nowMs() && claims.nonce === flow.nonce && !!provider.subjectOf(claims) // not-policy: seconds to milliseconds
  if (!valid) refuse('core.sign-in.provider-failed', `${label} did not confirm who you are.`, { status: 422, remedy: 'Try again.' })
  return { claims, next: flow.next }
}

/** An identity waiting for its address to be proven by emailed code before it is linked (MS3). */
interface PendingLink { provider: string, subject: string, address: string }

/**
 * Signs in the account behind a checked provider identity: the one it is linked to, else the one
 * holding its proven address, else a new one. An address the provider has not proven links to
 * nothing (ID-04); for Microsoft and a general provider it is proven by emailed code first (MS3).
 */
export async function signInWithProvider(unit: UnitView, event: H3Event, provider: SignInProvider, claims: ProviderClaims): Promise<{ accountId: string }> {
  const label = await labelOf(provider)
  const unverified = () => refuse('core.sign-in.provider-unverified', `${label} has not confirmed this account's email address.`, { status: 422, remedy: `Confirm your address with ${label}, or sign in another way.` })
  if (!claims.email) unverified()
  if (!(await provider.accepts(claims))) {
    const accepted = provider.organisation ? await useSetting(provider.settings.domains) as string[] : []
    refuse('core.sign-in.provider-domain', accepted.length ? `Only ${label} accounts from ${accepted.join(', ')} can sign in here.` : `${label} accounts from this organisation cannot sign in here.`, { status: 403, remedy: 'Choose an account from an organisation the theatre accepts.' })
  }
  const organisation = organisationOf(provider, claims)
  const address = normaliseAddress(claims.email!)
  const managedBy = await managingProvider(address)
  if (managedBy && managedBy.id !== provider.id)
    refuse('core.sign-in.provider-managed-elsewhere', `Addresses at ${domainOf(address)} sign in with ${await labelOf(managedBy)}.`, { status: 403, remedy: `Sign in with ${await labelOf(managedBy)} instead.` })
  const subject = provider.subjectOf(claims)!

  const linked = await first<{ id: string, account_id: string }>('SELECT id, account_id FROM core_federated_identities WHERE provider = ? AND subject = ?', provider.id, subject)
  const proven = linked ? true : await provider.addressProven(claims, address)
  if (!proven) {
    // Google's verdict is final; a domain this provider manages cannot be sent a code; nor can anyone while codes are off.
    if (provider.organisation || managedBy || !(await useSetting('core.sign-in.email-link'))) unverified()
    const pending: PendingLink = { provider: provider.id, subject, address }
    setShortCookie(event, PROVIDER_LINK_COOKIE, await sealValue('provider-link', pending), await useSetting('core.sign-in.link-lifetime') as number)
    refuse('core.sign-in.provider-prove-address', `${label} has not proven that ${address} is yours.`, { status: 422, remedy: 'We will email you a code to prove it, once.' })
  }
  const byAddress = linked ? null : await addressRow(address)
  // Every check comes before the first write: the callback turns a refusal into a redirect, so a
  // refusal must leave the unit empty.
  const knownId = linked?.account_id ?? byAddress?.account_id
  if (knownId) {
    const account = await accountById(knownId)
    if (account?.disabled_at) refuse('core.account.disabled', 'This account is disabled.', { status: 403, remedy: 'Contact the theatre to find out why.' })
    if (!account || account.merged_into_id || account.anonymised_at) refuse('core.sign-in.provider-failed', `${label} did not confirm who you are.`, { status: 422, remedy: 'Try again.' })
  }
  else if (!(await useSetting('core.sign-in.open-sign-up'))) {
    refuse('core.sign-in.closed', 'This theatre is not taking new accounts at the moment.', { status: 403, remedy: 'If you were expecting an account, ask the theatre to add you.' })
  }

  let accountId: string
  if (linked) {
    accountId = linked.account_id
    unit.add({ sql: 'UPDATE core_federated_identities SET last_used_at = ? WHERE id = ?', params: [nowMs(), linked.id] })
  }
  else {
    const held = await accountForProvenAddress(unit, address, 'provider', { name: claims.name })
    accountId = held.accountId
    unit.add({
      sql: 'INSERT INTO core_federated_identities (id, account_id, provider, subject, hosted_domain, email_id, linked_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [newId('fid'), accountId, provider.id, subject, organisation, held.emailId, nowMs(), nowMs()],
    })
  }
  // Strong only for Google, for an organisation and address the theatre manages.
  const managed = await useSetting('core.sign-in.managed-domains') as string[]
  const strong = !!provider.organisation && !!(await useSetting('core.sign-in.provider-is-strong')) && !!organisation && managed.includes(organisation) && managed.includes(domainOf(address))
  await startSession(unit, event, { accountId, methods: [provider.id as Method], assurance: strong ? 'strong' : 'basic' })
  unit.audit({ action: 'sign-in', record: ['core.account', accountId], detail: { method: provider.id } })
  return { accountId }
}

/** The address an identity is waiting on, for the sign-in page to send its code to (MS3). */
export async function pendingLink(event: H3Event): Promise<{ address: string, provider: string } | null> {
  const pending = await openValue<PendingLink>('provider-link', readCookie(event, PROVIDER_LINK_COOKIE))
  if (!pending) return null
  const provider = Object.hasOwn(PROVIDERS, pending.provider) ? PROVIDERS[pending.provider as keyof typeof PROVIDERS] : null
  return provider ? { address: pending.address, provider: await labelOf(provider) } : null
}

/**
 * Once an emailed code or link has proven an address, links the identity waiting on it in this
 * browser (MS3). A code for any other address links nothing, and the wait ends either way.
 */
export async function linkPendingIdentity(unit: UnitView, event: H3Event, proof: { address: string, accountId: string, emailId: string }): Promise<void> {
  const pending = await openValue<PendingLink>('provider-link', readCookie(event, PROVIDER_LINK_COOKIE))
  if (!pending) return
  clearCookie(event, PROVIDER_LINK_COOKIE)
  if (pending.address !== proof.address) return
  if (await first('SELECT 1 AS one FROM core_federated_identities WHERE provider = ? AND subject = ?', pending.provider, pending.subject)) return
  unit.add({
    sql: 'INSERT INTO core_federated_identities (id, account_id, provider, subject, hosted_domain, email_id, linked_at, last_used_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)',
    params: [newId('fid'), proof.accountId, pending.provider, pending.subject, proof.emailId, nowMs(), nowMs()],
  })
}
