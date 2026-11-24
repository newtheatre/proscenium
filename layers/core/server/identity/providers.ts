// The outside providers a person may sign in with (ID-04, ID-47). Each is an OpenID Connect provider,
// described here once: where to send the browser, where to swap the code, which issuers to accept,
// which settings switch it on and name its client, and which credential holds its secret. The flow
// itself (`oidc.ts`) knows nothing about any one provider: what differs is a hook here.
import { credential, credentialStatus, refuse, siteUrl, useContext, useSetting } from '#kit'
import type { SettingKey } from '#kit/registry-types'
import { CONSUMER_TENANT, checkDiscovery, microsoftIssuerMatches, microsoftSubject, microsoftTenantAllowed, oidcSubject, type Discovered, type DiscoveryProblem } from './provider-claims'

type Claims = Record<string, unknown> & { iss: string, sub: string }

export interface Endpoints { authoriseUrl: string, tokenUrl: string }

export interface SignInProvider {
  /** Kept in core_federated_identities.provider and named in the session's methods. Also the path segment. */
  id: string
  /** Shown on the sign-in button: "Sign in with {label}". A configured provider names itself in a setting. */
  label: string
  scope: string
  settings: {
    on: SettingKey
    clientId: SettingKey
    /** Google: the organisations it accepts. Microsoft and OIDC: the address domains it may link by (MS3). */
    domains: SettingKey
    /** Addresses in these domains sign in only through this provider (MS4). */
    managed: SettingKey
    label?: SettingKey
    tenants?: SettingKey
    personal?: SettingKey
    discovery?: SettingKey
  }
  /** The credential holding its client secret. */
  secret: string
  /** Google's `hd`: the claim naming the person's organisation, and the parameter keeping to one. */
  organisation?: { claim: string, hint?: string }
  /** Extra authorisation parameters, such as asking the person to choose an account. */
  extra?: Record<string, string>
  endpoints: () => Promise<Endpoints>
  /** Whether the token's issuer is this provider's, for the token's own claims. */
  issuerMatches: (claims: Claims) => Promise<boolean>
  /** The identity's key: never changes for the person (MS1, MS5). Null refuses the token. */
  subjectOf: (claims: Claims) => string | null
  /** Whether the provider's organisation check passes (Google's domains, Microsoft's tenants). */
  accepts: (claims: Claims) => Promise<boolean>
  /** Whether the email claim proves the address, so it may link to an account holding it (MS3). */
  addressProven: (claims: Claims, address: string) => Promise<boolean>
}

const domainIn = async (key: SettingKey, address: string) => (await useSetting(key) as string[]).includes(address.split('@').pop() ?? '')

/** Microsoft's authority: one listed tenant alone, any work or school tenant, or those and personal accounts. */
async function microsoftAuthority(): Promise<string> {
  const tenants = await useSetting('core.sign-in.microsoft-tenants') as string[]
  if (await useSetting('core.sign-in.microsoft-personal')) return 'common'
  return tenants.length === 1 ? tenants[0]! : 'organizations'
}

export class DiscoveryRefusal extends Error {
  constructor(public problem: DiscoveryProblem | 'unreachable') { super(problem) }
}

/** Fetches and checks a general provider's discovery document (MS5). */
export async function discover(url: string): Promise<Discovered> {
  if (!/^https:\/\/[^\s/]+/.test(url)) throw new DiscoveryRefusal('not-https')
  const timeout = await useSetting('core.external.timeout') as number
  let document: unknown
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeout * 1000) }) // not-policy: seconds to milliseconds
    if (!response.ok) throw new DiscoveryRefusal('unreachable')
    document = await response.json()
  }
  catch (error) {
    if (error instanceof DiscoveryRefusal) throw error
    throw new DiscoveryRefusal('unreachable')
  }
  const found = checkDiscovery(document, url)
  if (!found.ok) throw new DiscoveryRefusal(found.problem)
  return found
}

/** The discovered endpoints of the configured provider, or a refusal saying it is not ready. */
async function oidcDiscovered(): Promise<Discovered> {
  const url = await useSetting('core.sign-in.oidc-discovery') as string | null
  if (!url) refuse('core.sign-in.provider-unavailable', 'This sign-in is not set up yet.', { status: 503 })
  try {
    // Asked for twice in one sign-in (endpoints, then issuer): fetched once per request.
    const cache = useContext().cache
    const key = `identityDiscovery:${url}`
    return await ((cache[key] as Promise<Discovered> | undefined) ?? (cache[key] = discover(url!)))
  }
  catch {
    refuse('core.sign-in.provider-unavailable', 'This sign-in cannot reach its provider at the moment.', { status: 503, remedy: 'Try again later, or sign in another way.' })
  }
}

const GOOGLE: SignInProvider = {
  id: 'google',
  label: 'Google',
  scope: 'openid email profile',
  settings: { on: 'core.sign-in.google', clientId: 'core.sign-in.google-client-id', domains: 'core.sign-in.google-domains', managed: 'core.sign-in.managed-domains' },
  secret: 'CORE_GOOGLE_CLIENT_SECRET',
  organisation: { claim: 'hd', hint: 'hd' },
  extra: { prompt: 'select_account' },
  endpoints: async () => ({ authoriseUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token' }),
  issuerMatches: async claims => ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss),
  subjectOf: claims => claims.sub || null,
  accepts: async (claims) => {
    const accepted = await useSetting('core.sign-in.google-domains') as string[]
    return !accepted.length || (typeof claims.hd === 'string' && accepted.includes(claims.hd.toLowerCase()))
  },
  addressProven: async claims => claims.email_verified === true,
}

const MICROSOFT: SignInProvider = {
  id: 'microsoft',
  label: 'Microsoft',
  scope: 'openid email profile',
  settings: {
    on: 'core.sign-in.microsoft', clientId: 'core.sign-in.microsoft-client-id', domains: 'core.sign-in.microsoft-domains', managed: 'core.sign-in.microsoft-managed-domains',
    tenants: 'core.sign-in.microsoft-tenants', personal: 'core.sign-in.microsoft-personal',
  },
  secret: 'CORE_MICROSOFT_CLIENT_SECRET',
  extra: { prompt: 'select_account' },
  endpoints: async () => {
    const authority = `https://login.microsoftonline.com/${await microsoftAuthority()}/oauth2/v2.0`
    return { authoriseUrl: `${authority}/authorize`, tokenUrl: `${authority}/token` }
  },
  issuerMatches: async claims => microsoftIssuerMatches(claims),
  subjectOf: microsoftSubject,
  accepts: async claims => microsoftTenantAllowed(String(claims.tid), await useSetting('core.sign-in.microsoft-tenants') as string[], !!(await useSetting('core.sign-in.microsoft-personal'))),
  // Microsoft's email claim is whatever the tenant typed; xms_edov says the domain's owner verified it.
  addressProven: async (claims, address) => claims.xms_edov === true && claims.tid !== CONSUMER_TENANT && await domainIn('core.sign-in.microsoft-domains', address),
}

const OIDC: SignInProvider = {
  id: 'oidc',
  label: 'OpenID Connect',
  scope: 'openid email profile',
  settings: {
    on: 'core.sign-in.oidc', clientId: 'core.sign-in.oidc-client-id', domains: 'core.sign-in.oidc-domains', managed: 'core.sign-in.oidc-managed-domains',
    label: 'core.sign-in.oidc-label', discovery: 'core.sign-in.oidc-discovery',
  },
  secret: 'CORE_OIDC_CLIENT_SECRET',
  endpoints: async () => {
    const { authoriseUrl, tokenUrl } = await oidcDiscovered()
    return { authoriseUrl, tokenUrl }
  },
  issuerMatches: async claims => claims.iss === (await oidcDiscovered()).issuer,
  subjectOf: oidcSubject,
  accepts: async () => true,
  addressProven: async (claims, address) => claims.email_verified === true && await domainIn('core.sign-in.oidc-domains', address),
}

export const PROVIDERS = { google: GOOGLE, microsoft: MICROSOFT, oidc: OIDC } as const

export type ProviderId = keyof typeof PROVIDERS

/** The provider an address names, or a refusal that looks like any other missing page. */
export function providerById(id: string): SignInProvider {
  const provider = Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id as ProviderId] : undefined
  if (!provider) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return provider
}

/** The name on the button: the configured one for a general provider. */
export async function labelOf(provider: SignInProvider): Promise<string> {
  return (provider.settings.label && await useSetting(provider.settings.label) as string | null) || provider.label
}

/** Whether a provider is switched on with its client id and secret saved, so its button would work. */
export async function isOffered(provider: SignInProvider): Promise<boolean> {
  return !!(await useSetting(provider.settings.on)) && !!(await useSetting(provider.settings.clientId)) && !!(await credential(provider.secret))
}

/** The providers a signed-out browser is offered, in the order declared, with the organisations each accepts (none: any). */
export async function offeredProviders(): Promise<{ id: string, label: string, domains: string[] }[]> {
  const offered: { id: string, label: string, domains: string[] }[] = []
  for (const provider of Object.values(PROVIDERS) as SignInProvider[]) {
    // Only Google's list names organisations by domain; Microsoft's and the general provider's are link domains.
    if (await isOffered(provider)) offered.push({ id: provider.id, label: await labelOf(provider), domains: provider.organisation ? await useSetting(provider.settings.domains) as string[] : [] })
  }
  return offered
}

/** The provider an address's domain is managed by (MS4), if any. The settings rule keeps it to one. */
export async function managingProvider(address: string): Promise<SignInProvider | null> {
  const domain = address.split('@').pop() ?? ''
  for (const provider of Object.values(PROVIDERS) as SignInProvider[]) {
    if ((await useSetting(provider.settings.managed) as string[]).includes(domain)) return provider
  }
  return null
}

/** Every managed domain with its provider, for the sign-in page to send those addresses straight there. */
export async function managedDomains(): Promise<{ domains: string[], provider: string }[]> {
  const lists: { domains: string[], provider: string }[] = []
  for (const provider of Object.values(PROVIDERS) as SignInProvider[]) {
    const domains = await useSetting(provider.settings.managed) as string[]
    if (domains.length && await isOffered(provider)) lists.push({ domains, provider: provider.id })
  }
  return lists
}

/** What Admin > Sign-in shows on a provider's card and in its set-up: never the secret itself. */
export interface ProviderView {
  id: string
  label: string
  on: boolean
  clientId: string | null
  domains: string[]
  managedDomains: string[]
  /** Microsoft: the tenants it accepts and whether personal accounts may sign in. */
  tenants?: string[]
  personal?: boolean
  /** The general provider: its discovery address, and what was found there or why nothing was. */
  discovery?: string | null
  found?: Discovered | { ok: false, problem: DiscoveryProblem | 'unreachable' } | null
  secret: { saved: boolean, hint: string | null, start: string | null }
  /** The address to register at the provider as its redirect URI. */
  callbackUrl: string
  /** What still has to be saved before it can be put in use. */
  missing: ('client-id' | 'secret' | 'label' | 'discovery')[]
}

export async function providerView(provider: SignInProvider): Promise<ProviderView> {
  const clientId = await useSetting(provider.settings.clientId) as string | null
  const [status] = await credentialStatus([provider.secret])
  const saved = !!status?.source
  const discovery = provider.settings.discovery ? await useSetting(provider.settings.discovery) as string | null : undefined
  return {
    id: provider.id,
    label: await labelOf(provider),
    on: !!(await useSetting(provider.settings.on)),
    clientId,
    domains: await useSetting(provider.settings.domains) as string[],
    managedDomains: await useSetting(provider.settings.managed) as string[],
    ...(provider.settings.tenants ? { tenants: await useSetting(provider.settings.tenants) as string[], personal: !!(await useSetting(provider.settings.personal!)) } : {}),
    ...(discovery !== undefined ? { discovery, found: discovery ? await discover(discovery).catch((e: DiscoveryRefusal) => ({ ok: false as const, problem: e.problem })) : null } : {}),
    secret: { saved, hint: status?.hint ?? null, start: status?.start ?? null },
    callbackUrl: await siteUrl(`/api/core/sign-in/${provider.id}/callback`),
    missing: [
      ...(provider.settings.label && !(await useSetting(provider.settings.label)) ? ['label' as const] : []),
      ...(discovery === null ? ['discovery' as const] : []),
      ...(clientId ? [] : ['client-id' as const]),
      ...(saved ? [] : ['secret' as const]),
    ],
  }
}

/**
 * Asks the provider's token endpoint to swap a code that cannot exist, with the saved client. A
 * provider checks the client before the code (RFC 6749, 5.2), so `invalid_grant` means it accepted
 * the client id and secret and `invalid_client` means it did not. The redirect URI is not checked.
 */
export async function checkProvider(provider: SignInProvider, clientId: string, secret: string): Promise<'accepted' | 'rejected' | 'unreachable'> {
  const timeout = await useSetting('core.external.timeout') as number
  try {
    const response = await fetch((await provider.endpoints()).tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'proscenium-set-up-check', client_id: clientId, client_secret: secret, redirect_uri: await siteUrl(`/api/core/sign-in/${provider.id}/callback`) }),
      signal: AbortSignal.timeout(timeout * 1000), // not-policy: seconds to milliseconds
    })
    const body = await response.json().catch(() => ({})) as { error?: string }
    if (body.error === 'invalid_client' || body.error === 'unauthorized_client') return 'rejected'
    if (body.error === 'invalid_grant') return 'accepted'
    return 'unreachable'
  }
  catch {
    return 'unreachable'
  }
}
