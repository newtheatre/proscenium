// The authenticator app (TOTP): offered to people whose roles reach the console, confirms it is you,
// and after an email sign-in makes the session strong where the theatre allows. Never a sign-in on its own.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Browser, clearSetting, grantDirectly, leaveIdentity, reset, setSetting, signInByEmail, useIdentity } from './helpers'
import { rows } from '../../../../../tests/integration/helpers'
import { codeAt, fromBase32, stepAt } from '../../../server/identity/authenticator'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

/** The code the app would show, `ahead` steps from now. */
const codeFor = (secret: string, ahead = 0) => codeAt(fromBase32(secret), stepAt(Date.now()) + ahead)
// A code one step behind is refused if the step ends before the server checks it, so start clear of the edge.
async function clearOfStepEdge() {
  const left = 30_000 - (Date.now() % 30_000) // not-policy: RFC 6238's 30-second step
  if (left < 3_000) await new Promise(resolve => setTimeout(resolve, left + 50)) // not-policy: time for a few requests
}

async function staffWithApp() {
  const browser = new Browser()
  const accountId = await signInByEmail(browser)
  await grantDirectly(accountId, ['core.role.manage'])
  const started = await browser.post('/api/core/me/authenticator/start')
  expect(started.status).toBe(200)
  expect(started.body.uri).toMatch(/^otpauth:\/\/totp\/.+\?secret=[A-Z2-7]+&/)
  await clearOfStepEdge()
  const added = await browser.post('/api/core/me/authenticator/confirm', { code: await codeFor(started.body.secret, -1) })
  expect(added.status).toBe(200)
  return { browser, accountId, secret: started.body.secret as string }
}

describe('the authenticator app', () => {
  it('is not offered to somebody whose roles do not reach the console', async () => {
    const browser = new Browser()
    await signInByEmail(browser)
    expect((await browser.get('/api/core/me/passkeys')).body.authenticatorOffered).toBe(false)
    expect((await browser.post('/api/core/me/authenticator/start')).body.code).toBe('core.authenticator.not-offered')
  })

  it('keeps the secret sealed, and a wrong first code adds nothing', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    await grantDirectly(accountId, ['core.role.manage'])
    const started = await browser.post('/api/core/me/authenticator/start')
    const [row] = await rows<{ secret_sealed: string }>('SELECT secret_sealed FROM core_authenticators WHERE account_id = ?', accountId)
    expect(row!.secret_sealed).not.toContain(started.body.secret)
    const wrong = (await codeFor(started.body.secret)) === '000000' ? '111111' : '000000'
    expect((await browser.post('/api/core/me/authenticator/confirm', { code: wrong })).body.code).toBe('core.authenticator.code-wrong')
    expect((await browser.get('/api/core/me/passkeys')).body.authenticator).toBeNull()
  })

  it('after an email sign-in, a code makes the session strong and stands in for a passkey', async () => {
    const { browser, secret } = await staffWithApp()
    expect((await browser.get('/api/core/me')).body).toMatchObject({ session: { assurance: 'basic' }, consoleNeedsPasskey: false })
    expect((await browser.get('/api/core/me/reassert')).body).toMatchObject({ ways: ['authenticator', 'code'], authenticatorStrong: true })
    const confirmed = await browser.post('/api/core/me/reassert/authenticator', { code: await codeFor(secret) })
    expect(confirmed.body).toEqual({ reasserted: true, strong: true })
    expect((await browser.get('/api/core/me')).body.session.assurance).toBe('strong')
  })

  it('a code works once', async () => {
    const { browser, secret } = await staffWithApp()
    const code = await codeFor(secret)
    expect((await browser.post('/api/core/me/reassert/authenticator', { code })).status).toBe(200)
    expect((await browser.post('/api/core/me/reassert/authenticator', { code })).body.code).toBe('core.authenticator.code-wrong')
  })

  it('only refreshes the session when the theatre requires a passkey for the console', async () => {
    await setSetting('core.sign-in.authenticator-is-strong', false)
    try {
      const { browser, secret } = await staffWithApp()
      expect((await browser.get('/api/core/me')).body.consoleNeedsPasskey).toBe(true)
      expect((await browser.post('/api/core/me/reassert/authenticator', { code: await codeFor(secret) })).body).toEqual({ reasserted: true, strong: false })
      expect((await browser.get('/api/core/me')).body.session.assurance).toBe('basic')
    }
    finally {
      await clearSetting('core.sign-in.authenticator-is-strong')
    }
  })

  it('can be removed, and then its codes do nothing', async () => {
    const { browser, secret } = await staffWithApp()
    expect((await browser.delete('/api/core/me/authenticator')).status).toBe(200)
    expect((await browser.post('/api/core/me/reassert/authenticator', { code: await codeFor(secret, 1) })).body.code).toBe('core.reassert.authenticator-not-offered')
  })
})
