// Checks on a Microsoft or general OpenID Connect provider's answers that need nothing but the answer
// itself (ID-47), kept apart so they are tested without a database.

/** The tenant every personal Microsoft account signs in through. */
export const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'

type Claims = Record<string, unknown>

// MS2: Microsoft's v2.0 issuer names the token's own tenant, so a token from one tenant cannot pass as another's.
export function microsoftIssuerMatches(claims: Claims): boolean {
  return typeof claims.tid === 'string' && !!claims.tid && claims.iss === `https://login.microsoftonline.com/${claims.tid}/v2.0`
}

// MS2: an empty list accepts any work or school tenant; personal accounts only when the theatre allows them.
export function microsoftTenantAllowed(tid: string, tenants: string[], personal: boolean): boolean {
  if (tid === CONSUMER_TENANT) return personal
  return !tenants.length || tenants.includes(tid)
}

// MS1: tenant and object id never change; `sub` differs for every app registration.
export function microsoftSubject(claims: Claims): string | null {
  return typeof claims.tid === 'string' && claims.tid && typeof claims.oid === 'string' && claims.oid ? `${claims.tid}:${claims.oid}` : null
}

// MS5: `sub` is unique only within its issuer.
export function oidcSubject(claims: Claims): string | null {
  return typeof claims.iss === 'string' && claims.iss && typeof claims.sub === 'string' && claims.sub ? `${claims.iss}|${claims.sub}` : null
}

export type Discovered = { ok: true, issuer: string, authoriseUrl: string, tokenUrl: string }
export type DiscoveryProblem = 'not-https' | 'scopes' | 'incomplete' | 'issuer-mismatch'

const https = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/[^\s/]+/.test(value)

/**
 * Reads an issuer's discovery document (MS5). Fetched from `from`, its issuer must be the address it
 * was fetched under (OpenID Connect Discovery 4.3).
 */
export function checkDiscovery(document: unknown, from?: string): Discovered | { ok: false, problem: DiscoveryProblem } {
  const d = (document && typeof document === 'object' ? document : {}) as Record<string, unknown>
  const { issuer, authorization_endpoint: authorise, token_endpoint: token, scopes_supported: scopes } = d
  if (typeof issuer !== 'string' || typeof authorise !== 'string' || typeof token !== 'string') return { ok: false, problem: 'incomplete' }
  if (![issuer, authorise, token].every(https)) return { ok: false, problem: 'not-https' }
  if (!Array.isArray(scopes) || !scopes.includes('openid') || !scopes.includes('email')) return { ok: false, problem: 'scopes' }
  if (from && from.endsWith('/.well-known/openid-configuration') && from.slice(0, -'/.well-known/openid-configuration'.length) !== issuer.replace(/\/$/, ''))
    return { ok: false, problem: 'issuer-mismatch' }
  return { ok: true, issuer, authoriseUrl: authorise, tokenUrl: token }
}
