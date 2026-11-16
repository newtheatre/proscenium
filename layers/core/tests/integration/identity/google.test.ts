// Sign in with Google (ID-04), the managed-domain route through email (ID-01), Owner break-glass
// (ID-09) and the hourly sweep.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUnit } from '#kit/unit'
import { Authenticator } from './authenticator'
import { Browser, address, clearSetting, emailSignIn, env, grantDirectly, leaveIdentity, mailbox, passkeySignIn, reset, setSetting, signInByEmail, stubGoogle, tokenOf, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import sweep from '../../../server/tasks/sweep-identity'
import ownerRecoveryHealth from '../../../server/contributions/core.health-check/owner-recovery'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

const CLIENT = 'client-123.apps.googleusercontent.com'
const mutableEnv = env as unknown as Record<string, unknown>

function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature`
}

/** Starts the flow, lets "Google" answer with these claims, and follows the callback. */
async function googleSignIn(browser: Browser, claims: Record<string, unknown>, next?: string) {
  const start = await browser.get(`/api/core/sign-in/google${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  expect(start.status).toBe(302)
  const at = new URL(start.headers.get('location')!)
  const nonce = at.searchParams.get('nonce')
  let tokenRequest: URLSearchParams | undefined
  stubGoogle(async (url, init) => {
    if (!url.startsWith('https://oauth2.googleapis.com/token')) return new Response('unexpected', { status: 500 })
    tokenRequest = new URLSearchParams(String(init?.body))
    return Response.json({ id_token: idToken({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, nonce, ...claims }) })
  })
  const back = await browser.get(`/api/core/sign-in/google/callback?code=abc&state=${encodeURIComponent(at.searchParams.get('state')!)}`)
  return { start: at, back, location: back.headers.get('location'), tokenRequest }
}

describe('sign in with Google (ID-04)', () => {
  beforeEach(async () => {
    await setSetting('core.sign-in.google', true)
    await setSetting('core.sign-in.google-client-id', CLIENT)
    mutableEnv.CORE_GOOGLE_CLIENT_SECRET = 'test-google-secret'
  })
  afterEach(async () => {
    for (const key of ['core.sign-in.google', 'core.sign-in.google-client-id', 'core.sign-in.google-domains', 'core.sign-in.managed-domains', 'core.sign-in.provider-is-strong']) await clearSetting(key)
    delete mutableEnv.CORE_GOOGLE_CLIENT_SECRET
  })

  it('is not there while Google sign-in is off', async () => {
    await clearSetting('core.sign-in.google')
    expect((await new Browser().get('/api/core/sign-in/google')).status).toBe(404)
  })

  it('uses PKCE, state and a nonce, and a verified address signs in to the account that holds it', async () => {
    const to = address()
    const existing = await signInByEmail(new Browser(), to)
    const browser = new Browser()
    const { start, location, tokenRequest } = await googleSignIn(browser, { sub: 'g-1', email: to, email_verified: true, name: 'Someone' }, '/account')
    expect(start.searchParams.get('code_challenge_method')).toBe('S256')
    expect(tokenRequest?.get('code_verifier')).toBeTruthy()
    expect(location).toBe('/account')
    const me = (await browser.get('/api/core/me')).body
    expect(me.account.id).toBe(existing)
    expect(me.session.assurance).toBe('basic')
    expect(await rows('SELECT account_id FROM core_federated_identities WHERE subject = ?', 'g-1')).toEqual([{ account_id: existing }])
  })

  it('an address Google has not verified links to nothing', async () => {
    const to = address()
    await signInByEmail(new Browser(), to)
    const browser = new Browser()
    const { location } = await googleSignIn(browser, { sub: 'g-2', email: to, email_verified: false })
    expect(location).toBe('/sign-in?error=core.sign-in.provider-unverified')
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(false)
    expect(await rows('SELECT 1 FROM core_federated_identities WHERE subject = ?', 'g-2')).toEqual([])
  })

  it('refuses an organisation the theatre does not accept, writing nothing', async () => {
    await setSetting('core.sign-in.google-domains', ['theatre.example'])
    const browser = new Browser()
    const { start, location } = await googleSignIn(browser, { sub: 'g-3', email: address(), email_verified: true, hd: 'elsewhere.example' })
    expect(start.searchParams.get('hd')).toBe('theatre.example')
    expect(location).toBe('/sign-in?error=core.sign-in.provider-domain')
    expect(await rows('SELECT 1 FROM core_federated_identities WHERE subject = ?', 'g-3')).toEqual([])
  })

  it('a wrong state, a wrong audience or a replayed callback is refused', async () => {
    const browser = new Browser()
    await browser.get('/api/core/sign-in/google')
    stubGoogle(async () => Response.json({ id_token: idToken({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, sub: 'g-4', email: address(), email_verified: true }) }))
    expect((await browser.get('/api/core/sign-in/google/callback?code=abc&state=forged')).headers.get('location')).toBe('/sign-in?error=core.sign-in.provider-failed')
    const other = new Browser()
    const { location } = await googleSignIn(other, { sub: 'g-5', email: address(), email_verified: true, aud: 'someone-else' })
    expect(location).toBe('/sign-in?error=core.sign-in.provider-failed')
  })

  it('a managed domain gets no emailed link: email sign-in sends it to Google', async () => {
    await setSetting('core.sign-in.managed-domains', ['staff.example'])
    const answer = await emailSignIn(new Browser(), 'stage.manager@staff.example')
    expect(answer.body.provider).toBe('google')
    expect(answer.body.to).toContain('login_hint=stage.manager%40staff.example')
    expect(mailbox).toHaveLength(0)
    expect(await rows('SELECT count(*) AS n FROM core_account_tokens WHERE address = ?', 'stage.manager@staff.example')).toEqual([{ n: 0 }])
  })

  it('a managed domain with a strong provider gives a strong session', async () => {
    await setSetting('core.sign-in.google-domains', ['staff.example'])
    await setSetting('core.sign-in.managed-domains', ['staff.example'])
    await setSetting('core.sign-in.provider-is-strong', true)
    const browser = new Browser()
    await googleSignIn(browser, { sub: 'g-6', email: 'lighting@staff.example', email_verified: true, hd: 'staff.example' })
    expect((await browser.get('/api/core/me')).body.session.assurance).toBe('strong')
  })
})

describe('Owner break-glass (ID-09)', () => {
  afterEach(() => {
    delete mutableEnv.CORE_OWNER_RECOVERY
  })

  it('looks like a missing page without the secret, or with the wrong one', async () => {
    const browser = new Browser()
    expect((await browser.post('/api/core/owner-recovery/options', { secret: 'anything', address: address() })).status).toBe(404)
    mutableEnv.CORE_OWNER_RECOVERY = 'correct horse battery staple'
    expect((await browser.post('/api/core/owner-recovery/options', { secret: 'wrong', address: address() })).status).toBe(404)
  })

  it('enrols a new passkey on an existing Owner, and cannot make one', async () => {
    const to = address()
    const ownerId = await signInByEmail(new Browser(), to)
    await grantDirectly(ownerId, [], { roleKey: 'owner' }).catch(async () => {
      const [role] = await rows<{ id: string }>('SELECT id FROM core_roles WHERE key = \'owner\'')
      return grantDirectly(ownerId, [], { roleId: role!.id })
    })
    mutableEnv.CORE_OWNER_RECOVERY = 'correct horse battery staple'
    expect(await inContext(async () => (await ownerRecoveryHealth.check()).state)).toBe('failing')
    const browser = new Browser()
    expect((await browser.post('/api/core/owner-recovery/options', { secret: 'correct horse battery staple', address: address() })).body.code).toBe('core.owner-recovery.not-owner')
    const options = await browser.post('/api/core/owner-recovery/options', { secret: 'correct horse battery staple', address: to })
    expect(options.status).toBe(200)
    const device = new Authenticator()
    const enrolled = await browser.post('/api/core/owner-recovery', { secret: 'correct horse battery staple', challengeId: options.body.challengeId, response: await device.create(options.body.options) })
    expect(enrolled.body).toEqual({ enrolled: true })
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(false)
    const signedIn = new Browser()
    await passkeySignIn(signedIn, device)
    expect((await signedIn.get('/api/core/me')).body.account.id).toBe(ownerId)
    delete mutableEnv.CORE_OWNER_RECOVERY
    expect(await inContext(async () => (await ownerRecoveryHealth.check()).state)).toBe('ok')
  })
})

describe('the hourly sweep', () => {
  it('forgets spent challenges, expired tokens and ended sessions, and keeps live ones', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    const ended = new Browser()
    await signInByEmail(ended)
    await ended.post('/api/core/sign-out')
    const waiting = await emailSignIn(new Browser(), address())
    expect(tokenOf(waiting.message!)).toBeTruthy()
    await env.DB.prepare('UPDATE core_account_tokens SET expires_at = 1 WHERE id = (SELECT id FROM core_account_tokens ORDER BY created_at DESC LIMIT 1)').run()
    await inContext(async () => {
      const unit = createUnit()
      await sweep(unit, { dueAt: Date.now() })
      await unit.commit()
    })
    expect(await rows('SELECT count(*) AS n FROM core_sessions WHERE ended_at IS NOT NULL')).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM core_account_tokens WHERE expires_at <= ?', Date.now())).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM core_passkey_challenges WHERE used_at IS NOT NULL')).toEqual([{ n: 0 }])
    expect((await browser.get('/api/core/me')).body.account.id).toBe(accountId)
  })
})
