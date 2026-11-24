// The checks on a Microsoft or general OpenID Connect ID token that need no database (ID-47, MS1, MS2, MS5).
import { describe, expect, it } from 'vitest'
import { CONSUMER_TENANT, checkDiscovery, microsoftIssuerMatches, microsoftSubject, microsoftTenantAllowed, oidcSubject } from '../../server/identity/provider-claims'

const TENANT = '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const OTHER = '0a0b0c0d-1e1f-4a2b-8c3d-4e5f6a7b8c9d'

describe('microsoft-issuer-must-match-tid (MS2)', () => {
  it('accepts the v2.0 issuer for the token\'s own tenant', () => {
    expect(microsoftIssuerMatches({ iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, tid: TENANT })).toBe(true)
  })

  it('refuses an issuer naming another tenant than the token\'s tid', () => {
    expect(microsoftIssuerMatches({ iss: `https://login.microsoftonline.com/${OTHER}/v2.0`, tid: TENANT })).toBe(false)
  })

  it('refuses a token with no tid, or the v1 issuer', () => {
    expect(microsoftIssuerMatches({ iss: `https://login.microsoftonline.com/${TENANT}/v2.0` })).toBe(false)
    expect(microsoftIssuerMatches({ iss: `https://sts.windows.net/${TENANT}/`, tid: TENANT })).toBe(false)
  })
})

describe('the tenants a theatre accepts (MS2)', () => {
  it('any work or school tenant while the list is empty, but not a personal account', () => {
    expect(microsoftTenantAllowed(TENANT, [], false)).toBe(true)
    expect(microsoftTenantAllowed(CONSUMER_TENANT, [], false)).toBe(false)
  })

  it('only the listed tenants once there is a list', () => {
    expect(microsoftTenantAllowed(TENANT, [TENANT], false)).toBe(true)
    expect(microsoftTenantAllowed(OTHER, [TENANT], false)).toBe(false)
  })

  it('a personal account when the theatre allows them, list or not', () => {
    expect(microsoftTenantAllowed(CONSUMER_TENANT, [], true)).toBe(true)
    expect(microsoftTenantAllowed(CONSUMER_TENANT, [TENANT], true)).toBe(true)
  })
})

describe('identity keys (MS1, MS5)', () => {
  it('a Microsoft identity is keyed by tenant and object id, never the pairwise sub', () => {
    expect(microsoftSubject({ tid: TENANT, oid: 'obj-1', sub: 'pairwise' })).toBe(`${TENANT}:obj-1`)
    expect(microsoftSubject({ tid: TENANT, sub: 'pairwise' })).toBeNull()
  })

  it('a general provider\'s identity is keyed by issuer and sub', () => {
    expect(oidcSubject({ iss: 'https://id.example.ac.uk', sub: 'abc' })).toBe('https://id.example.ac.uk|abc')
  })
})

describe('oidc-discovery-https-only (MS5)', () => {
  const good = {
    issuer: 'https://id.example.ac.uk',
    authorization_endpoint: 'https://id.example.ac.uk/authorize',
    token_endpoint: 'https://id.example.ac.uk/token',
    scopes_supported: ['openid', 'email', 'profile'],
  }

  it('accepts an HTTPS issuer offering openid and email', () => {
    expect(checkDiscovery(good)).toEqual({ ok: true, issuer: good.issuer, authoriseUrl: good.authorization_endpoint, tokenUrl: good.token_endpoint })
  })

  it('refuses an issuer or endpoint that is not HTTPS', () => {
    expect(checkDiscovery({ ...good, issuer: 'http://id.example.ac.uk' })).toEqual({ ok: false, problem: 'not-https' })
    expect(checkDiscovery({ ...good, token_endpoint: 'http://id.example.ac.uk/token' })).toEqual({ ok: false, problem: 'not-https' })
  })

  it('refuses one lacking the openid or email scope, or its endpoints', () => {
    expect(checkDiscovery({ ...good, scopes_supported: ['openid', 'profile'] })).toEqual({ ok: false, problem: 'scopes' })
    expect(checkDiscovery({ ...good, scopes_supported: undefined })).toEqual({ ok: false, problem: 'scopes' })
    expect(checkDiscovery({ issuer: good.issuer })).toEqual({ ok: false, problem: 'incomplete' })
    expect(checkDiscovery('not a document')).toEqual({ ok: false, problem: 'incomplete' })
  })
})
