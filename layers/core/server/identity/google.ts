// Sign in with Google (ID-04): the OpenID Connect code flow with PKCE, state and a nonce, carried
// between the redirect and the callback in a sealed cookie. The ID token comes straight from
// Google's token endpoint over TLS, so its signature is not checked again (OpenID Connect Core
// 3.1.3.7); its issuer, audience, expiry, nonce, verified email and organisation are.
import type { H3Event } from 'h3'
import { first, newId, nowMs, refuse, useSetting, credential, siteUrl, type UnitView } from '#kit'
import { base64url, fromBase64url, openValue, randomToken, sealValue } from './crypto'
import { PROVIDER_COOKIE, clearCookie, readCookie, setShortCookie } from './web'
import { accountById, accountForProvenAddress, addressRow, domainOf, normaliseAddress } from './accounts'
import { startSession } from './sessions'

export const AUTHORISE = 'https://accounts.google.com/o/oauth2/v2/auth'
export const TOKEN = 'https://oauth2.googleapis.com/token'
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const FLOW_LIFETIME = 10 * 60 // not-policy: seconds a person has to finish at Google

interface Flow { state: string, nonce: string, verifier: string, next: string | null }

export interface GoogleClaims { iss: string, aud: string, exp: number, sub: string, email?: string, email_verified?: boolean, hd?: string, nonce?: string, name?: string }

async function clientId(): Promise<string> {
  if (!(await useSetting('core.sign-in.google'))) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const id = await useSetting('core.sign-in.google-client-id') as string | null
  if (!id) refuse('core.sign-in.provider-unavailable', 'Google sign-in is not set up yet.', { status: 503 })
  return id
}

/** Where Google sends the browser back to, on the site's one origin. */
async function callbackUrl(): Promise<string> {
  return siteUrl('/api/core/sign-in/google/callback')
}

/** The address to send the browser to, at Google. */
export async function startGoogle(event: H3Event, input: { next: string | null, loginHint?: string }): Promise<string> {
  const client = await clientId()
  const flow: Flow = { state: randomToken(), nonce: randomToken(), verifier: randomToken(), next: input.next }
  setShortCookie(event, PROVIDER_COOKIE, await sealValue('google', flow), FLOW_LIFETIME)
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flow.verifier))))
  const domains = await useSetting('core.sign-in.google-domains') as string[]
  const query = new URLSearchParams({
    client_id: client, redirect_uri: await callbackUrl(), response_type: 'code', scope: 'openid email profile',
    state: flow.state, nonce: flow.nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  })
  if (domains.length === 1) query.set('hd', domains[0]!)
  if (input.loginHint) query.set('login_hint', input.loginHint)
  return `${AUTHORISE}?${query}`
}

function decodeClaims(idToken: string): GoogleClaims {
  const payload = idToken.split('.')[1]
  if (!payload) refuse('core.sign-in.provider-failed', 'Google did not confirm who you are.', { status: 422, remedy: 'Try again.' })
  return JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as GoogleClaims
}

/** Swaps the code for Google's verdict, and checks it. */
export async function finishGoogle(event: H3Event, input: { code: string, state: string }): Promise<{ claims: GoogleClaims, next: string | null }> {
  const client = await clientId()
  const flow = await openValue<Flow>('google', readCookie(event, PROVIDER_COOKIE))
  clearCookie(event, PROVIDER_COOKIE)
  if (!flow || flow.state !== input.state) refuse('core.sign-in.provider-failed', 'Google sign-in took too long, or was started in another browser.', { status: 422, remedy: 'Try again.' })
  const secret = await credential('CORE_GOOGLE_CLIENT_SECRET')
  if (!secret) refuse('core.sign-in.provider-unavailable', 'Google sign-in is not set up yet.', { status: 503 })
  const response = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: input.code, client_id: client, client_secret: secret, redirect_uri: await callbackUrl(), grant_type: 'authorization_code', code_verifier: flow.verifier }),
  })
  const body = await response.json().catch(() => ({})) as { id_token?: string }
  if (!response.ok || !body.id_token) refuse('core.sign-in.provider-failed', 'Google did not confirm who you are.', { status: 422, remedy: 'Try again.' })
  const claims = decodeClaims(body.id_token)
  const valid = ISSUERS.includes(claims.iss) && claims.aud === client && claims.exp * 1000 > nowMs() && claims.nonce === flow.nonce && !!claims.sub // not-policy: seconds to milliseconds
  if (!valid) refuse('core.sign-in.provider-failed', 'Google did not confirm who you are.', { status: 422, remedy: 'Try again.' })
  return { claims, next: flow.next }
}

/**
 * Signs in the account behind a checked Google identity: the one it is linked to, else the one
 * holding its verified address, else a new one. An address Google has not verified links to
 * nothing (ID-04).
 */
export async function signInWithGoogle(unit: UnitView, event: H3Event, claims: GoogleClaims): Promise<{ accountId: string }> {
  if (!claims.email || claims.email_verified !== true)
    refuse('core.sign-in.provider-unverified', 'Google has not confirmed this account\'s email address.', { status: 422, remedy: 'Confirm your address with Google, or sign in another way.' })
  const accepted = await useSetting('core.sign-in.google-domains') as string[]
  if (accepted.length && !accepted.includes((claims.hd ?? '').toLowerCase()))
    refuse('core.sign-in.provider-domain', `Only Google accounts from ${accepted.join(', ')} can sign in here.`, { status: 403, remedy: 'Choose an account from one of those organisations.' })

  const address = normaliseAddress(claims.email)
  const linked = await first<{ id: string, account_id: string }>('SELECT id, account_id FROM core_federated_identities WHERE provider = \'google\' AND subject = ?', claims.sub)
  const byAddress = linked ? null : await addressRow(address)
  // Every check comes before the first write: the callback turns a refusal into a redirect, so a
  // refusal must leave the unit empty.
  const knownId = linked?.account_id ?? byAddress?.account_id
  if (knownId) {
    const account = await accountById(knownId)
    if (account?.disabled_at) refuse('core.account.disabled', 'This account is disabled.', { status: 403, remedy: 'Contact the theatre to find out why.' })
    if (!account || account.merged_into_id || account.anonymised_at) refuse('core.sign-in.provider-failed', 'Google did not confirm who you are.', { status: 422, remedy: 'Try again.' })
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
    const proven = await accountForProvenAddress(unit, address, 'provider', { name: claims.name })
    accountId = proven.accountId
    unit.add({
      sql: 'INSERT INTO core_federated_identities (id, account_id, provider, subject, hosted_domain, email_id, linked_at, last_used_at) VALUES (?, ?, \'google\', ?, ?, ?, ?, ?)',
      params: [newId('fid'), accountId, claims.sub, claims.hd ?? null, proven.emailId, nowMs(), nowMs()],
    })
  }
  const managed = await useSetting('core.sign-in.managed-domains') as string[]
  const strong = !!(await useSetting('core.sign-in.provider-is-strong')) && !!claims.hd && managed.includes(claims.hd) && managed.includes(domainOf(address))
  await startSession(unit, event, { accountId, methods: ['google'], assurance: strong ? 'strong' : 'basic' })
  unit.audit({ action: 'sign-in', record: ['core.account', accountId], detail: { method: 'google' } })
  return { accountId }
}
