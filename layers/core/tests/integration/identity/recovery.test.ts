// Recovering a lost passkey and managing my email addresses (ID-08, ID-12).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Authenticator } from './authenticator'
import { Browser, address, deliver, env, goStale, grantDirectly, leaveIdentity, reassert, reset, setSetting, clearSetting, signInByEmail, staff, unclaimedAccount, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { setMailer, useMailer, type OutgoingEmail } from '../../../server/notifications/mailer'
import { createUnit } from '#kit'
import { setClock } from '#kit/clock'
import sweep from '../../../server/tasks/sweep-identity'

/** Every email sent, with its subject and text, alongside the sign-in mailbox the helpers keep. */
const sent: OutgoingEmail[] = []

beforeAll(async () => {
  await useIdentity()
  const inner = useMailer()
  setMailer(async (email) => {
    sent.push(email)
    return inner(email)
  })
})
afterAll(leaveIdentity)
beforeEach(() => {
  reset()
  sent.length = 0
})

const to = (addressee: string) => sent.filter(e => e.to === addressee)
const linkIn = (email: OutgoingEmail | undefined) => /(https?:\/\/\S+#[\w-]+)/.exec(email?.text ?? '')?.[1] ?? ''
const fragment = (link: string) => link.split('#')[1]!

/** A person with a passkey and its recovery codes, signed in by email first. */
async function withPasskey() {
  const { browser, device, accountId } = await staff()
  const [{ address: mine }] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', accountId)
  const codes = (await browser.post('/api/core/me/recovery-codes')).body.recoveryCodes as string[]
  await deliver()
  sent.length = 0
  return { browser, device, accountId, mine: mine!, codes }
}

describe('seeing my recovery codes again (ID-14)', () => {
  it('shows the set in order, used ones marked, only after confirming it is you', async () => {
    const { browser, device, accountId, mine, codes } = await withPasskey()
    await new Browser().post('/api/core/sign-in/recovery', { address: mine, code: codes[2] })
    await goStale(accountId)
    expect((await browser.post('/api/core/me/recovery-codes/show')).body.code).toBe('core.access.not-fresh')
    await reassert(browser, device)
    const shown = await browser.post('/api/core/me/recovery-codes/show')
    expect(shown.status).toBe(200)
    expect(shown.body.codes.map((c: { code: string }) => c.code)).toEqual(codes)
    expect(shown.body.codes.map((c: { used: boolean }) => c.used)).toEqual(codes.map((_, i) => i === 2))
    // Kept sealed, never in the clear.
    const [row] = await rows<{ code_sealed: string }>('SELECT code_sealed FROM core_recovery_codes WHERE account_id = ? LIMIT 1', accountId)
    expect(codes).not.toContain(row!.code_sealed)
  })
})

describe('recovering a lost passkey (ID-08)', () => {
  it('a recovery code works once, and its session can only enrol a passkey', async () => {
    const { accountId, mine, codes } = await withPasskey()
    const lost = new Browser()
    const used = await lost.post('/api/core/sign-in/recovery', { address: mine, code: codes[0] })
    expect(used.status).toBe(200)
    expect(used.body.next).toBe('/account/passkey')
    expect((await lost.get('/api/core/me')).body.account.id).toBe(accountId)
    // Anything but enrolling a passkey is refused to this session.
    expect((await lost.get('/api/core/me/sessions')).status).toBe(401)
    expect((await lost.get('/api/core/me/addresses')).status).toBe(401)
    const device = new Authenticator()
    const options = await lost.post('/api/core/me/passkeys/options')
    expect(options.status).toBe(200)
    const added = await lost.post('/api/core/me/passkeys', { challengeId: options.body.challengeId, response: await device.create(options.body.options) })
    expect(added.status).toBe(200)
    // The same code again is refused, the same way as a wrong one.
    const again = await new Browser().post('/api/core/sign-in/recovery', { address: mine, code: codes[0] })
    expect(again.body.code).toBe('core.recovery.code-wrong')
    const unknown = await new Browser().post('/api/core/sign-in/recovery', { address: address(), code: codes[1] })
    expect(unknown.body.code).toBe('core.recovery.code-wrong')
    expect(unknown.status).toBe(again.status)
  })

  it('using a recovery code, and the passkey that follows, tell every verified address', async () => {
    const { accountId, mine, codes } = await withPasskey()
    const second = address()
    await env.DB.prepare('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, ?, \'self\', ?)').bind(`aem_${crypto.randomUUID().slice(0, 20)}`, accountId, second, Date.now(), Date.now()).run()
    const lost = new Browser()
    await lost.post('/api/core/sign-in/recovery', { address: mine, code: codes[2] })
    await deliver()
    for (const each of [mine, second]) expect(to(each).map(e => e.subject)).toEqual(['Your sign-in at The Test Theatre has changed'])
    expect(to(mine)[0]!.text).toContain('a recovery code, used to sign in')
    const options = await lost.post('/api/core/me/passkeys/options')
    await lost.post('/api/core/me/passkeys', { challengeId: options.body.challengeId, response: await new Authenticator().create(options.body.options) })
    await deliver()
    expect(to(second)).toHaveLength(2)
    expect(to(second)[1]!.text).toContain('a passkey')
  })

  it('staff issue a single-use enrolment link that lapses, and never for themselves', async () => {
    const { accountId: lockedOut, mine } = await withPasskey()
    const desk = await staff()
    await grantDirectly(desk.accountId, ['core.account.recover'])
    expect((await desk.browser.post(`/api/core/accounts/${desk.accountId}/enrolment-link`)).body.code).toBe('core.access.own-record')
    const issued = await desk.browser.post(`/api/core/accounts/${lockedOut}/enrolment-link`)
    expect(issued.status).toBe(200)
    expect(issued.body.expiresAt - Date.now()).toBeGreaterThan(23 * 3600_000) // the default, 24 hours
    await deliver()
    expect(to(mine)[0]!.text).toContain('a link from the theatre for adding a passkey')
    // A second link replaces the first.
    const second = await desk.browser.post(`/api/core/accounts/${lockedOut}/enrolment-link`)
    expect((await new Browser().post('/api/core/sign-in/link', { token: fragment(issued.body.link) })).status).toBe(410)
    const person = new Browser()
    const landed = await person.post('/api/core/sign-in/link', { token: fragment(second.body.link) })
    expect(landed.status).toBe(200)
    expect(landed.body).toEqual({ next: '/account/passkey', offerPasskey: true, welcome: false })
    expect((await person.get('/api/core/me')).body.account.id).toBe(lockedOut)
    expect((await person.get('/api/core/me/sessions')).status).toBe(401)
    expect((await new Browser().post('/api/core/sign-in/link', { token: fragment(second.body.link) })).status).toBe(410)
    // A link not used in time is refused.
    const late = await desk.browser.post(`/api/core/accounts/${lockedOut}/enrolment-link`)
    await env.DB.prepare('UPDATE core_account_tokens SET expires_at = 1 WHERE purpose = \'enrol_passkey\' AND account_id = ? AND used_at IS NULL').bind(lockedOut).run()
    expect((await new Browser().post('/api/core/sign-in/link', { token: fragment(late.body.link) })).body.code).toBe('core.sign-in.link-expired')
  })

  it('an enrolment link needs core.account.recover', async () => {
    const { accountId: lockedOut } = await withPasskey()
    const desk = await staff()
    expect((await desk.browser.post(`/api/core/accounts/${lockedOut}/enrolment-link`)).status).toBe(403)
  })
})

describe('managing my email addresses (ID-12)', () => {
  it('an added address does nothing until its link is used, then is verified', async () => {
    const { browser } = await staff()
    const extra = address()
    expect((await browser.post('/api/core/me/addresses', { address: extra })).status).toBe(200)
    await deliver()
    const [verify] = to(extra)
    expect(verify!.subject).toBe('Confirm your email address for The Test Theatre')
    expect(linkIn(verify)).toMatch(/\/sign-in\/verify-address#/)
    let listed = (await browser.get('/api/core/me/addresses')).body.addresses
    expect(listed.find((a: any) => a.address === extra).verified).toBe(false)
    // An unverified address is no way in.
    expect((await new Browser().post('/api/core/sign-in/recovery', { address: extra, code: 'aaaaa-bbbbb' })).body.code).toBe('core.recovery.code-wrong')
    expect((await new Browser().post('/api/core/me/addresses/verify', { token: fragment(linkIn(verify)) })).status).toBe(200)
    listed = (await browser.get('/api/core/me/addresses')).body.addresses
    expect(listed.find((a: any) => a.address === extra).verified).toBe(true)
    expect((await new Browser().post('/api/core/me/addresses/verify', { token: fragment(linkIn(verify)) })).body.code).toBe('core.address.link-unknown')
  })

  it('the link for an unconfirmed address can be sent again after a pause (AC-6)', async () => {
    const { browser } = await staff()
    const extra = address()
    const start = Date.now()
    setClock(start)
    try {
      expect((await browser.post('/api/core/me/addresses', { address: extra })).status).toBe(200)
      const listed = (await browser.get('/api/core/me/addresses')).body.addresses
      expect(listed.find((a: any) => a.address === extra).resendAt).toBe(start + 60_000) // not-policy: the default pause
      const soon = await browser.post('/api/core/me/addresses', { address: extra })
      expect(soon.status).toBe(429)
      expect(soon.body.code).toBe('core.address.resend-wait')
      setClock(start + 61_000) // not-policy: past the pause
      expect((await browser.post('/api/core/me/addresses', { address: extra })).status).toBe(200)
      await deliver()
      expect(to(extra)).toHaveLength(2)
    }
    finally {
      setClock(undefined)
    }
  })

  it('adding an address needs a recent re-assertion', async () => {
    const { browser, device, accountId } = await staff()
    await goStale(accountId)
    expect((await browser.post('/api/core/me/addresses', { address: address() })).body.code).toBe('core.access.not-fresh')
    await reassert(browser, device)
    expect((await browser.post('/api/core/me/addresses', { address: address() })).status).toBe(200)
  })

  it('an address verified on another account is refused without saying whose it is', async () => {
    const other = new Browser()
    const taken = address()
    await signInByEmail(other, taken)
    const { browser } = await staff()
    const refused = await browser.post('/api/core/me/addresses', { address: taken })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('core.address.unavailable')
    expect(JSON.stringify(refused.body)).not.toContain(taken)
    expect(refused.body.remedy).toMatch(/merge/)
  })

  it('verifying an unclaimed account\'s address merges that account in', async () => {
    const guestAddress = address()
    const guest = await unclaimedAccount(guestAddress)
    const { browser, accountId } = await staff()
    expect((await browser.post('/api/core/me/addresses', { address: guestAddress })).status).toBe(200)
    await deliver()
    expect((await new Browser().post('/api/core/me/addresses/verify', { token: fragment(linkIn(to(guestAddress)[0])) })).status).toBe(200)
    expect(await rows('SELECT merged_into_id FROM core_accounts WHERE id = ?', guest)).toEqual([{ merged_into_id: accountId }])
    expect(await rows('SELECT account_id, verified_at IS NOT NULL AS verified FROM core_account_emails WHERE address = ?', guestAddress)).toEqual([{ account_id: accountId, verified: 1 }])
    expect(await rows('SELECT started_by FROM core_account_merges WHERE merged_account_id = ?', guest)).toEqual([{ started_by: 'claim' }])
  })

  it('an address left unproved on a claimed account can be taken by whoever proves it', async () => {
    const squatter = await staff()
    const contested = address()
    await squatter.browser.post('/api/core/me/addresses', { address: contested })
    const owner = await staff()
    expect((await owner.browser.post('/api/core/me/addresses', { address: contested })).status).toBe(200)
    await deliver()
    const ownersLink = linkIn(to(contested).at(-1))
    expect((await new Browser().post('/api/core/me/addresses/verify', { token: fragment(ownersLink) })).status).toBe(200)
    expect(await rows('SELECT account_id FROM core_account_emails WHERE address = ?', contested)).toEqual([{ account_id: owner.accountId }])
  })

  it('changing the audience or members\' address tells the old one', async () => {
    const { browser, accountId } = await staff()
    const [{ address: first }] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', accountId)
    const extra = address()
    await browser.post('/api/core/me/addresses', { address: extra })
    await deliver()
    await new Browser().post('/api/core/me/addresses/verify', { token: fragment(linkIn(to(extra)[0])) })
    const extraId = (await browser.get('/api/core/me/addresses')).body.addresses.find((a: any) => a.address === extra).id
    sent.length = 0
    expect((await browser.put(`/api/core/me/addresses/${extraId}`, { use: 'members' })).status).toBe(200)
    await deliver()
    expect(to(first!).map(e => e.subject)).toEqual(['Your members\' email address at The Test Theatre has changed'])
    const listed = (await browser.get('/api/core/me/addresses')).body.addresses
    expect(listed.find((a: any) => a.address === extra)).toMatchObject({ members: true, audience: false })
    sent.length = 0
    await browser.put(`/api/core/me/addresses/${extraId}`, { use: 'audience' })
    await deliver()
    expect(to(first!).map(e => e.subject)).toEqual(['Your email address at The Test Theatre has changed'])
  })

  it('an unverified address cannot be used for a side', async () => {
    const { browser } = await staff()
    const { body } = await browser.post('/api/core/me/addresses', { address: address() })
    expect((await browser.put(`/api/core/me/addresses/${body.id}`, { use: 'audience' })).body.code).toBe('core.address.unverified')
  })

  it('the last verified address, and the audience address, cannot be removed', async () => {
    const { browser } = await staff()
    const [mine] = (await browser.get('/api/core/me/addresses')).body.addresses
    expect((await browser.delete(`/api/core/me/addresses/${mine.id}`)).body.code).toBe('core.address.in-use')
    // An unverified address can go, and its waiting link goes with it.
    const extra = address()
    const { body } = await browser.post('/api/core/me/addresses', { address: extra })
    await deliver()
    expect((await browser.delete(`/api/core/me/addresses/${body.id}`)).status).toBe(200)
    expect((await new Browser().post('/api/core/me/addresses/verify', { token: fragment(linkIn(to(extra)[0])) })).body.code).toBe('core.address.link-unknown')
  })

  it('the last verified address cannot be removed even when it is not the audience address', async () => {
    const { browser, accountId } = await staff()
    const [mine] = (await browser.get('/api/core/me/addresses')).body.addresses
    // The audience pointer on an address that is not verified, as a provider sign-up can leave it.
    const pending = address()
    const { body } = await browser.post('/api/core/me/addresses', { address: pending })
    await env.DB.prepare('UPDATE core_accounts SET audience_email_id = ? WHERE id = ?').bind(body.id, accountId).run()
    expect((await browser.delete(`/api/core/me/addresses/${mine.id}`)).body.code).toBe('core.address.last')
  })

  it('the sweep removes addresses left unverified too long, but not a guest\'s own address', async () => {
    await setSetting('core.sign-in.unverified-address-lifetime', 86400)
    try {
      const { browser } = await staff()
      const extra = address()
      await browser.post('/api/core/me/addresses', { address: extra })
      const guestAddress = address()
      await unclaimedAccount(guestAddress)
      await env.DB.prepare('UPDATE core_account_emails SET created_at = 1 WHERE address IN (?, ?)').bind(extra, guestAddress).run()
      await inContext(async () => {
        const unit = createUnit()
        await sweep(unit, { dueAt: Date.now() })
        await unit.commit()
      })
      expect(await rows('SELECT count(*) AS n FROM core_account_emails WHERE address = ?', extra)).toEqual([{ n: 0 }])
      expect(await rows('SELECT count(*) AS n FROM core_account_emails WHERE address = ?', guestAddress)).toEqual([{ n: 1 }])
    }
    finally {
      await clearSetting('core.sign-in.unverified-address-lifetime')
    }
  })
})
