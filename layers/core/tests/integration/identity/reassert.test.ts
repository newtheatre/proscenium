// Confirming it is you in place (ID-28): a passkey for any session, a code by email only for a basic
// session on an account with no passkey. The code refreshes the session and never makes it strong.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Browser, deliver, goStale, leaveIdentity, mailbox, reset, signInByEmail, staff, useIdentity } from './helpers'
import { rows } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

async function sessionOf(accountId: string) {
  return (await rows<{ assurance: string, reasserted_at: number | null }>('SELECT assurance, reasserted_at FROM core_sessions WHERE account_id = ? AND ended_at IS NULL ORDER BY created_at DESC LIMIT 1', accountId))[0]!
}

async function codeFor(address: string) {
  await deliver()
  return mailbox.filter(m => m.address === address && m.subject.startsWith('Your code to confirm')).at(-1)?.variables.code
}

describe('confirming it is you (ID-28)', () => {
  it('a basic session with no passkey confirms with an emailed code, which refreshes it and leaves it basic', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    const [{ address }] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', accountId)
    await goStale(accountId)
    const ways = (await browser.get('/api/core/me/reassert')).body
    expect(ways.ways).toEqual(['code'])
    expect(ways.address).toMatch(/^.•••@/)
    expect(ways.address).not.toBe(address)
    expect((await browser.post('/api/core/me/reassert/code')).status).toBe(200)
    const code = await codeFor(address!)
    expect(code).toMatch(/^\d{6}$/)
    const wrong = code === '000000' ? '111111' : '000000'
    expect((await browser.post('/api/core/me/reassert/code/confirm', { code: wrong })).body.code).toBe('core.reassert.code-wrong')
    expect((await browser.post('/api/core/me/reassert/code/confirm', { code })).status).toBe(200)
    const session = await sessionOf(accountId)
    expect(session.assurance).toBe('basic')
    expect(session.reasserted_at).toBeGreaterThan(Date.now() - 60_000)
    // Used once.
    expect((await browser.post('/api/core/me/reassert/code/confirm', { code })).body.code).toBe('core.reassert.code-wrong')
  })

  it('a code works only for the session that asked for it, and dies after too many wrong tries', async () => {
    const first = new Browser()
    const accountId = await signInByEmail(first)
    const [{ address }] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', accountId)
    const second = new Browser()
    await signInByEmail(second, address)
    await first.post('/api/core/me/reassert/code')
    const code = await codeFor(address!)
    expect((await second.post('/api/core/me/reassert/code/confirm', { code })).body.code).toBe('core.reassert.code-wrong')
    await first.post('/api/core/me/reassert/code')
    const fresh = await codeFor(address!)
    const wrong = fresh === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await first.post('/api/core/me/reassert/code/confirm', { code: wrong })
    expect((await first.post('/api/core/me/reassert/code/confirm', { code: fresh })).body.code).toBe('core.reassert.code-spent')
  })

  it('a strong session confirms with a passkey only, never by email', async () => {
    const { browser, accountId } = await staff()
    await goStale(accountId)
    expect((await browser.get('/api/core/me/reassert')).body).toEqual({ ways: ['passkey'], address: null })
    expect((await browser.post('/api/core/me/reassert/code')).body.code).toBe('core.reassert.code-not-offered')
    expect(await rows('SELECT count(*) AS n FROM core_account_tokens WHERE purpose = \'reassert\' AND account_id = ?', accountId)).toEqual([{ n: 0 }])
  })
})
