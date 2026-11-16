// Getting in: email links and codes, passkeys, the return path and the abuse limits
// (ID-01, ID-02, ID-07, ID-10), with the never-regress cases of the test plan named as they are there.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Authenticator } from './authenticator'
import { Browser, addPasskey, address, emailSignIn, env, leaveIdentity, mailbox, passkeySignIn, reset, signInByEmail, tokenOf, useIdentity, deliver } from './helpers'
import { rows } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

const setSetting = (key: string, value: unknown) => env.DB.prepare('INSERT INTO core_settings (key, value, updated_at) VALUES (?, ?, 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run()
const clearSetting = (key: string) => env.DB.prepare('DELETE FROM core_settings WHERE key = ?').bind(key).run()

describe('email sign-in (ID-01)', () => {
  it('sends a link and a code, and the link signs in and makes the account', async () => {
    const browser = new Browser()
    const to = address()
    const { status, body, message } = await emailSignIn(browser, to)
    expect(status).toBe(200)
    expect(body).toEqual({ sent: true })
    expect(message?.variables.link).toMatch(/^http:\/\/test\/sign-in\/link#/)
    expect(message?.variables.code).toMatch(/^\d{6}$/)
    const used = await browser.post('/api/core/sign-in/link', { token: tokenOf(message!) })
    expect(used.status).toBe(200)
    expect(used.body).toEqual({ next: '/', offerPasskey: true })
    const me = await browser.get('/api/core/me')
    expect(me.body).toMatchObject({ signedIn: true, session: { assurance: 'basic' }, addresses: [{ address: to, verified: true }] })
  })

  it('sign-in reveals nothing: the same answer for a known and an unknown address', async () => {
    const known = address()
    await signInByEmail(new Browser(), known)
    reset()
    const a = await emailSignIn(new Browser(), known)
    const b = await emailSignIn(new Browser(), address())
    expect(a.status).toBe(b.status)
    expect(a.body).toEqual(b.body)
    expect([...a.headers.keys()].sort()).toEqual([...b.headers.keys()].sort())
  })

  it('no account before proof: asking for a link writes no account', async () => {
    const to = address()
    await emailSignIn(new Browser(), to)
    expect(await rows('SELECT id FROM core_account_emails WHERE address = ?', to)).toEqual([])
    const [token] = await rows<{ token_hash: string, code_hash: string }>('SELECT token_hash, code_hash FROM core_account_tokens WHERE address = ?', to)
    expect(token).toBeTruthy()
  })

  it('sign-in link works once, even in a race of two requests', async () => {
    const to = address()
    const browser = new Browser()
    const { message } = await emailSignIn(browser, to)
    const token = tokenOf(message!)
    const [one, two] = await Promise.all([new Browser().post('/api/core/sign-in/link', { token }), new Browser().post('/api/core/sign-in/link', { token })])
    expect([one.status, two.status].sort()).toEqual([200, 409])
    expect([one.body.code, two.body.code]).toContain('core.sign-in.link-used')
    const again = await new Browser().post('/api/core/sign-in/link', { token })
    expect(again.status).toBe(410)
    expect(again.body.code).toBe('core.sign-in.link-used')
    const accounts = await rows('SELECT a.id FROM core_accounts a JOIN core_account_emails e ON e.account_id = a.id WHERE e.address = ?', to)
    expect(accounts).toHaveLength(1)
    expect(await rows('SELECT id FROM core_sessions WHERE account_id = ?', (accounts[0] as any).id)).toHaveLength(1)
  })

  it('a link stops working after its lifetime', async () => {
    const browser = new Browser()
    const { message } = await emailSignIn(browser, address())
    await env.DB.prepare('UPDATE core_account_tokens SET expires_at = 1 WHERE used_at IS NULL').run()
    const used = await browser.post('/api/core/sign-in/link', { token: tokenOf(message!) })
    expect(used.body.code).toBe('core.sign-in.link-expired')
  })

  it('the code signs in, in the browser that asked', async () => {
    const browser = new Browser()
    const to = address()
    const { message } = await emailSignIn(browser, to)
    const used = await browser.post('/api/core/sign-in/code', { address: to, code: message!.variables.code })
    expect(used.status).toBe(200)
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(true)
  })

  it('sign-in code is bound to its browser: the right code elsewhere is refused and counts as a try', async () => {
    const to = address()
    const { message } = await emailSignIn(new Browser(), to)
    const elsewhere = new Browser()
    const tried = await elsewhere.post('/api/core/sign-in/code', { address: to, code: message!.variables.code })
    expect(tried.status).toBe(422)
    expect(tried.body.code).toBe('core.sign-in.code-wrong')
    expect(await rows('SELECT attempts FROM core_account_tokens WHERE address = ?', to)).toEqual([{ attempts: 1 }])
    expect((await elsewhere.get('/api/core/me')).body.signedIn).toBe(false)
  })

  it('the code dies after the allowed wrong tries', async () => {
    const browser = new Browser()
    const to = address()
    const { message } = await emailSignIn(browser, to)
    const wrong = message!.variables.code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await browser.post('/api/core/sign-in/code', { address: to, code: wrong })
    const right = await browser.post('/api/core/sign-in/code', { address: to, code: message!.variables.code })
    expect(right.body.code).toBe('core.sign-in.code-spent')
  })

  it('with open sign-up off, an unknown address gets the same answer and no email', async () => {
    await setSetting('core.sign-in.open-sign-up', false)
    try {
      const to = address()
      const asked = await emailSignIn(new Browser(), to)
      expect(asked.body).toEqual({ sent: true })
      expect(asked.message).toBeUndefined()
      expect(await rows('SELECT id FROM core_account_tokens WHERE address = ?', to)).toEqual([])
    }
    finally {
      await clearSetting('core.sign-in.open-sign-up')
    }
  })

  it('email cannot make a session strong', async () => {
    const browser = new Browser()
    await signInByEmail(browser)
    expect((await browser.get('/api/core/me')).body.session.assurance).toBe('basic')
  })
})

describe('abuse (ID-10)', () => {
  it('refuses a request without the bot check, and with a failed one', async () => {
    const browser = new Browser()
    expect((await browser.post('/api/core/sign-in/email', { address: address() })).status).toBe(403)
    expect((await browser.post('/api/core/sign-in/email', { address: address() }, { 'cf-turnstile-response': 'fail' })).status).toBe(403)
  })

  it('refuses outright when the bot check has no secret', async () => {
    const saved = env.CORE_TURNSTILE_SECRET_KEY
    env.CORE_TURNSTILE_SECRET_KEY = ''
    try {
      const asked = await new Browser().post('/api/core/sign-in/email', { address: address() }, { 'cf-turnstile-response': 'pass' })
      expect(asked.status).toBe(503)
      expect(asked.body.code).toBe('core.sign-in.unavailable')
    }
    finally {
      env.CORE_TURNSTILE_SECRET_KEY = saved
    }
  })

  it('over the per-address limit, the same answer and nothing sent', async () => {
    const to = address()
    // Each request from a different network address, so only the per-address limit can bite.
    const ask = (i: number) => new Browser().post('/api/core/sign-in/email', { address: to }, { 'cf-turnstile-response': 'pass', 'x-forwarded-for': `192.0.2.${i}` })
    for (let i = 1; i <= 10; i++) expect((await ask(i)).body).toEqual({ sent: true })
    await deliver()
    const before = mailbox.length
    const over = await ask(11)
    await deliver()
    expect(over.status).toBe(200)
    expect(over.body).toEqual({ sent: true })
    expect(mailbox.length).toBe(before)
  })

  it('over the per-network limit, the kit refuses before anything is written', async () => {
    const ask = () => new Browser().post('/api/core/sign-in/email', { address: address() }, { 'cf-turnstile-response': 'pass', 'x-forwarded-for': '198.51.100.7' })
    for (let i = 0; i < 10; i++) await ask()
    const over = await ask()
    expect(over.status).toBe(429)
  })

  it('tokens are stored hashed: no row holds the link or the code', async () => {
    const to = address()
    const { message } = await emailSignIn(new Browser(), to)
    const [row] = await rows<Record<string, unknown>>('SELECT * FROM core_account_tokens WHERE address = ?', to)
    const values = Object.values(row!).map(String).join(' ')
    expect(values).not.toContain(tokenOf(message!))
    expect(values).not.toContain(message!.variables.code)
    const [job] = await rows<{ payload: string }>('SELECT payload FROM core_jobs WHERE name = \'core.send-sign-in-link\' ORDER BY created_at DESC LIMIT 1')
    expect(job!.payload).not.toContain(tokenOf(message!))
    expect(job!.payload).not.toContain(message!.variables.code)
  })
})

describe('passkeys (ID-02)', () => {
  it('signs in with no address typed, and the session is strong', async () => {
    const browser = new Browser()
    const device = new Authenticator()
    const accountId = await signInByEmail(browser)
    await addPasskey(browser, device)
    const other = new Browser()
    const signedIn = await passkeySignIn(other, device)
    expect(signedIn.status).toBe(200)
    const me = await other.get('/api/core/me')
    expect(me.body).toMatchObject({ account: { id: accountId }, session: { assurance: 'strong' } })
  })

  it('a removed passkey signs nobody in', async () => {
    const browser = new Browser()
    const device = new Authenticator()
    await signInByEmail(browser)
    await addPasskey(browser, device)
    await addPasskey(browser, device)
    const [first] = (await browser.get('/api/core/me/passkeys')).body.passkeys
    expect((await browser.delete(`/api/core/me/passkeys/${first.id}`)).status).toBe(200)
    const refused = await passkeySignIn(new Browser(), device)
    expect(refused.status).toBe(422)
    expect((await passkeySignIn(new Browser(), device.credentials.length > 1 ? device : device)).status).toBe(422)
  })

  it('a challenge works once', async () => {
    const browser = new Browser()
    const device = new Authenticator()
    await signInByEmail(browser)
    await addPasskey(browser, device)
    const options = await browser.post('/api/core/sign-in/passkey/options')
    const response = await device.get(options.body.options)
    expect((await new Browser().post('/api/core/sign-in/passkey', { challengeId: options.body.challengeId, response })).status).toBe(200)
    expect((await new Browser().post('/api/core/sign-in/passkey', { challengeId: options.body.challengeId, response })).status).toBe(410)
  })
})

describe('landing where I was going (ID-07)', () => {
  it('returns to the page first asked for, by link and by passkey', async () => {
    const browser = new Browser()
    const { message } = await emailSignIn(browser, address(), '/whats-on/hamlet?date=2026-12-01')
    expect((await browser.post('/api/core/sign-in/link', { token: tokenOf(message!) })).body.next).toBe('/whats-on/hamlet?date=2026-12-01')
    const device = new Authenticator()
    await addPasskey(browser, device)
    expect((await passkeySignIn(new Browser(), device, '/account')).body.next).toBe('/account')
  })

  it('ignores a return address that is not a path on this site', async () => {
    for (const next of ['https://evil.example/x', '//evil.example/x', '/%2F%2Fevil.example', '/\\evil.example', 'javascript:alert(1)']) {
      const browser = new Browser()
      const { message } = await emailSignIn(browser, address(), next)
      expect((await browser.post('/api/core/sign-in/link', { token: tokenOf(message!) })).body.next).toBe('/')
    }
  })
})

describe('sessions', () => {
  it('signing out ends the session at once', async () => {
    const browser = new Browser()
    await signInByEmail(browser)
    const cookie = new Map(browser.cookies)
    expect((await browser.post('/api/core/sign-out')).status).toBe(200)
    const replay = new Browser()
    replay.cookies = cookie
    expect((await replay.get('/api/core/me')).body.signedIn).toBe(false)
  })

  it('refuses a change sent from another site', async () => {
    const browser = new Browser()
    await signInByEmail(browser)
    browser.origin = 'https://evil.example'
    const refused = await browser.post('/api/core/sign-out')
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('core.access.wrong-origin')
  })

  it('a session lapses after the idle limit', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    await env.DB.prepare('UPDATE core_sessions SET last_seen_at = 1 WHERE account_id = ?').bind(accountId).run()
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(false)
  })
})

describe('the sign-in email job', () => {
  it('does not send a link that was used before the job ran', async () => {
    const browser = new Browser()
    const to = address()
    await browser.post('/api/core/sign-in/email', { address: to }, { 'cf-turnstile-response': 'pass' })
    await env.DB.prepare('UPDATE core_account_tokens SET used_at = 1 WHERE address = ?').bind(to).run()
    await deliver()
    expect(mailbox.filter(m => m.address === to)).toEqual([])
  })
})
