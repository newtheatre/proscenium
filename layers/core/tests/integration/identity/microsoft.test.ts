// Sign in with Microsoft and a general OpenID Connect provider (ID-47): tenants, an address Microsoft
// has not proved, managed domains per provider, and the discovery address.
import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { Browser, address, clearSetting, emailSignIn, grantDirectly, leaveIdentity, reset, setSetting, signInByEmail, staff, stubGoogle, useIdentity } from './helpers'
import { rows, saveKey } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

const CLIENT = '00000000-aaaa-4bbb-8ccc-000000000001'
const TENANT = '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const OTHER = '0a0b0c0d-1e1f-4a2b-8c3d-4e5f6a7b8c9d'
const CONSUMER = '9188040d-6c67-4c5b-b112-36a304b66dad'
const ISSUER = 'https://id.example.ac.uk'
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`

const SETTINGS = [
  'core.sign-in.microsoft', 'core.sign-in.microsoft-client-id', 'core.sign-in.microsoft-tenants', 'core.sign-in.microsoft-personal',
  'core.sign-in.microsoft-domains', 'core.sign-in.microsoft-managed-domains', 'core.sign-in.oidc', 'core.sign-in.oidc-label',
  'core.sign-in.oidc-discovery', 'core.sign-in.oidc-client-id', 'core.sign-in.oidc-domains', 'core.sign-in.oidc-managed-domains',
  'core.sign-in.google', 'core.sign-in.google-client-id', 'core.sign-in.managed-domains',
]

function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature`
}

const discovery = (overrides: Record<string, unknown> = {}) => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  scopes_supported: ['openid', 'email', 'profile'],
  ...overrides,
})

// Each test's people are new: the database outlives a test, so object ids are made up afresh.
const objectId = () => `obj-${crypto.randomUUID()}`
const linkedTo = (subject: string) => rows('SELECT account_id FROM core_federated_identities WHERE subject = ?', subject)

/** Starts the flow, lets the provider answer with these claims, and follows the callback. */
async function providerSignIn(browser: Browser, provider: 'microsoft' | 'oidc', given: Record<string, unknown>) {
  const claims = provider === 'microsoft' ? { oid: objectId(), ...given } : given
  const answer = (url: string, init?: RequestInit, nonce?: string | null) => {
    if (url === DISCOVERY) return Response.json(discovery())
    const tokenUrl = provider === 'oidc' ? `${ISSUER}/token` : 'https://login.microsoftonline.com/'
    if (!url.startsWith(tokenUrl) || init?.method !== 'POST') return new Response('unexpected', { status: 500 })
    const tid = (claims.tid as string | undefined) ?? TENANT
    const base = provider === 'microsoft'
      ? { iss: `https://login.microsoftonline.com/${tid}/v2.0`, aud: CLIENT, tid }
      : { iss: ISSUER, aud: CLIENT }
    return Response.json({ id_token: idToken({ ...base, exp: Math.floor(Date.now() / 1000) + 600, nonce, sub: 'pairwise-1', ...claims }) })
  }
  stubGoogle(async (url, init) => answer(url, init))
  const start = await browser.get(`/api/core/sign-in/${provider}`)
  expect(start.status).toBe(302)
  const at = new URL(start.headers.get('location')!)
  stubGoogle(async (url, init) => answer(url, init, at.searchParams.get('nonce')))
  const back = await browser.get(`/api/core/sign-in/${provider}/callback?code=abc&state=${encodeURIComponent(at.searchParams.get('state')!)}`)
  return { start: at, location: back.headers.get('location') }
}

async function useMicrosoft() {
  await setSetting('core.sign-in.microsoft-client-id', CLIENT)
  await saveKey('CORE_MICROSOFT_CLIENT_SECRET', 'test-microsoft-secret')
  await setSetting('core.sign-in.microsoft', true)
}

afterEach(async () => {
  for (const key of SETTINGS) await clearSetting(key)
  for (const key of ['CORE_MICROSOFT_CLIENT_SECRET', 'CORE_OIDC_CLIENT_SECRET', 'CORE_GOOGLE_CLIENT_SECRET']) await saveKey(key, null)
})

describe('sign in with Microsoft (ID-47)', () => {
  beforeEach(useMicrosoft)

  it('is offered beside the others once on, and keys the identity by tenant and object id (MS1)', async () => {
    const me = (await new Browser().get('/api/core/me')).body
    expect(me.signIn.providers.map((p: { id: string }) => p.id)).toContain('microsoft')
    await setSetting('core.sign-in.microsoft-domains', ['uni.example.ac.uk'])
    const browser = new Browser()
    const oid = objectId()
    const { start, location } = await providerSignIn(browser, 'microsoft', { oid, email: `${oid}@uni.example.ac.uk`, xms_edov: true, name: 'A Student' })
    expect(start.origin + start.pathname).toBe('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize')
    expect(location).toBe('/')
    expect(await linkedTo(`${TENANT}:${oid}`)).toHaveLength(1)
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(true)
  })

  it('cannot be put in use without its client id and secret', async () => {
    await clearSetting('core.sign-in.microsoft')
    await saveKey('CORE_MICROSOFT_CLIENT_SECRET', null)
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.identity-settings.manage'])
    const turnOn = await admin.browser.put('/api/core/settings/core.sign-in.microsoft', { value: true, confirm: true })
    expect(turnOn.body.fields).toMatchObject({ value: 'core.settings.rules.microsoft-needs-client-secret' })
  })

  it('microsoft-tenant-allow-list: a tenant not listed is refused, and personal accounts unless allowed (MS2)', async () => {
    await setSetting('core.sign-in.microsoft-tenants', [TENANT])
    const { start, location } = await providerSignIn(new Browser(), 'microsoft', { tid: OTHER, email: address() })
    expect(start.pathname).toBe(`/${TENANT}/oauth2/v2.0/authorize`)
    expect(location).toBe('/sign-in?error=core.sign-in.provider-domain')
    expect((await providerSignIn(new Browser(), 'microsoft', { tid: CONSUMER, email: address() })).location).toBe('/sign-in?error=core.sign-in.provider-domain')
    await setSetting('core.sign-in.microsoft-personal', true)
    const oid = objectId()
    const personal = await providerSignIn(new Browser(), 'microsoft', { oid, tid: CONSUMER, email: address() })
    expect(personal.start.pathname).toBe('/common/oauth2/v2.0/authorize')
    expect(personal.location).toBe('/sign-in?error=core.sign-in.provider-prove-address')
    expect(await linkedTo(`${CONSUMER}:${oid}`)).toEqual([])
  })

  it('refuses an issuer naming another tenant than its tid', async () => {
    const { location } = await providerSignIn(new Browser(), 'microsoft', { iss: `https://login.microsoftonline.com/${OTHER}/v2.0`, email: address() })
    expect(location).toBe('/sign-in?error=core.sign-in.provider-failed')
  })

  it('microsoft-email-not-trusted: without xms_edov an existing account is not linked; the emailed code links it (MS3)', async () => {
    await setSetting('core.sign-in.microsoft-domains', ['example.org'])
    const to = address()
    const existing = await signInByEmail(new Browser(), to)
    const browser = new Browser()
    const oid = objectId()
    const { location } = await providerSignIn(browser, 'microsoft', { oid, email: to })
    expect(location).toBe('/sign-in?error=core.sign-in.provider-prove-address')
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(false)
    expect(await linkedTo(`${TENANT}:${oid}`)).toEqual([])
    expect((await browser.get('/api/core/sign-in/proving')).body).toEqual({ address: to, provider: 'Microsoft' })

    const { message } = await emailSignIn(browser, to)
    const used = await browser.post('/api/core/sign-in/code', { address: to, code: message!.variables.code })
    expect(used.status).toBe(200)
    expect(await linkedTo(`${TENANT}:${oid}`)).toEqual([{ account_id: existing }])
    expect((await browser.get('/api/core/sign-in/proving')).body).toEqual({ address: null, provider: null })

    // Linked now, so the next Microsoft sign-in needs no code.
    const again = new Browser()
    expect((await providerSignIn(again, 'microsoft', { oid, email: to })).location).toBe('/')
    expect((await again.get('/api/core/me')).body.account.id).toBe(existing)
  })

  it('with xms_edov but a domain not listed, still asks for the code', async () => {
    const to = address()
    await signInByEmail(new Browser(), to)
    expect((await providerSignIn(new Browser(), 'microsoft', { email: to, xms_edov: true })).location).toBe('/sign-in?error=core.sign-in.provider-prove-address')
  })

  it('a code for another address links nothing', async () => {
    const browser = new Browser()
    const oid = objectId()
    await providerSignIn(browser, 'microsoft', { oid, email: address() })
    const other = address()
    const { message } = await emailSignIn(browser, other)
    expect((await browser.post('/api/core/sign-in/code', { address: other, code: message!.variables.code })).status).toBe(200)
    expect(await linkedTo(`${TENANT}:${oid}`)).toEqual([])
  })
})

describe('managed-domain-one-provider (MS4)', () => {
  beforeEach(useMicrosoft)

  it('refuses a domain named in two managed lists', async () => {
    await setSetting('core.sign-in.microsoft-domains', ['uni.example.ac.uk'])
    await setSetting('core.sign-in.google-client-id', 'client.apps.googleusercontent.com')
    await saveKey('CORE_GOOGLE_CLIENT_SECRET', 'test-google-secret')
    await setSetting('core.sign-in.google', true)
    await setSetting('core.sign-in.managed-domains', ['uni.example.ac.uk'])
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.identity-settings.manage'])
    const both = await admin.browser.put('/api/core/settings/core.sign-in.microsoft-managed-domains', { value: ['uni.example.ac.uk'], confirm: true })
    expect(both.body.fields).toMatchObject({ value: 'core.settings.rules.managed-domain-one-provider' })
  })

  it('an address in a Microsoft-managed domain is sent to Microsoft, not emailed, and Google refuses it', async () => {
    await setSetting('core.sign-in.microsoft-domains', ['uni.example.ac.uk'])
    await setSetting('core.sign-in.microsoft-managed-domains', ['uni.example.ac.uk'])
    const answer = await emailSignIn(new Browser(), 'student@uni.example.ac.uk')
    expect(answer.body.provider).toBe('microsoft')
    expect(answer.body.to).toContain('/api/core/sign-in/microsoft?')
    expect(answer.message).toBeUndefined()
    expect((await new Browser().get('/api/core/me')).body.signIn.managed).toEqual([{ domains: ['uni.example.ac.uk'], provider: 'microsoft' }])

    await setSetting('core.sign-in.google-client-id', 'client.apps.googleusercontent.com')
    await saveKey('CORE_GOOGLE_CLIENT_SECRET', 'test-google-secret')
    await setSetting('core.sign-in.google', true)
    const browser = new Browser()
    const start = new URL((await browser.get('/api/core/sign-in/google')).headers.get('location')!)
    stubGoogle(async () => Response.json({ id_token: idToken({ iss: 'https://accounts.google.com', aud: 'client.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, nonce: start.searchParams.get('nonce'), sub: 'g-ms', email: 'student@uni.example.ac.uk', email_verified: true }) }))
    const back = await browser.get(`/api/core/sign-in/google/callback?code=abc&state=${encodeURIComponent(start.searchParams.get('state')!)}`)
    expect(back.headers.get('location')).toBe('/sign-in?error=core.sign-in.provider-managed-elsewhere')
  })
})

describe('a general OpenID Connect provider (MS5)', () => {
  async function admin() {
    const person = await staff()
    await grantDirectly(person.accountId, ['core.identity-settings.manage'])
    return person.browser
  }

  it('oidc-discovery-https-only: an issuer that is not HTTPS or lacks the scopes is refused when saved', async () => {
    const browser = await admin()
    stubGoogle(async url => url === 'https://plain.example/.well-known/openid-configuration'
      ? Response.json(discovery({ issuer: 'http://plain.example' }))
      : url === 'https://noemail.example/.well-known/openid-configuration'
        ? Response.json(discovery({ issuer: 'https://noemail.example', scopes_supported: ['openid'] }))
        : new Response('unexpected', { status: 500 }))
    const save = (discoveryUrl: string) => browser.put('/api/core/sign-in-providers/oidc', { clientId: CLIENT, domains: [], label: 'University', discovery: discoveryUrl, confirm: true })
    expect((await save('http://plain.example/.well-known/openid-configuration')).body.code).toBe('core.sign-in.oidc-discovery-not-https')
    expect((await save('https://plain.example/.well-known/openid-configuration')).body.code).toBe('core.sign-in.oidc-discovery-not-https')
    expect((await save('https://noemail.example/.well-known/openid-configuration')).body.code).toBe('core.sign-in.oidc-discovery-scopes')
    expect(await rows('SELECT 1 FROM core_settings WHERE key = \'core.sign-in.oidc-discovery\'')).toEqual([])
  })

  it('saves a good discovery address, shows what it found, and signs in keyed by issuer and sub', async () => {
    const browser = await admin()
    stubGoogle(async url => url === DISCOVERY ? Response.json(discovery()) : new Response('unexpected', { status: 500 }))
    const saved = await browser.put('/api/core/sign-in-providers/oidc', { clientId: CLIENT, domains: ['example.org'], label: 'University', discovery: DISCOVERY, secret: 'oidc-secret', confirm: true })
    expect(saved.status).toBe(200)
    expect(saved.body.provider).toMatchObject({ id: 'oidc', label: 'University', discovery: DISCOVERY, found: { issuer: ISSUER, authoriseUrl: `${ISSUER}/authorize`, tokenUrl: `${ISSUER}/token` } })
    await setSetting('core.sign-in.oidc', true)
    const me = (await new Browser().get('/api/core/me')).body
    expect(me.signIn.providers).toContainEqual({ id: 'oidc', label: 'University', domains: [] })

    const to = address()
    const person = new Browser()
    const sub = objectId()
    const { start, location } = await providerSignIn(person, 'oidc', { sub, email: to, email_verified: true })
    expect(start.origin + start.pathname).toBe(`${ISSUER}/authorize`)
    expect(location).toBe('/')
    expect(await linkedTo(`${ISSUER}|${sub}`)).toHaveLength(1)
  })
})
