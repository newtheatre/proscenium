// People without a sign-in (ID-05), people added and invited by staff (ID-06), and finding a
// person (ID-30).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUnit } from '#kit/unit'
import { Authenticator } from './authenticator'
import { Browser, address, deliver, env, grantDirectly, leaveIdentity, mailbox, reset, setSetting, clearSetting, setUpOwner, signInByEmail, staff, tokenOf, unclaimedAccount, useIdentity } from './helpers'
import { claimLink } from '../../../server/identity/claim'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { findOrCreateAccount, type FindOrCreateInput } from '../../../server/identity/guests'

let owner: { browser: Browser, device: Authenticator, accountId: string }

beforeAll(async () => {
  useIdentity()
  const browser = new Browser()
  const device = new Authenticator()
  owner = { browser, device, accountId: await setUpOwner(browser, device) }
})
afterAll(leaveIdentity)
beforeEach(reset)

/** Runs findOrCreateAccount in its own unit, as a checkout would, and commits it. */
async function checkout(input: Partial<FindOrCreateInput> & { address?: string | null }) {
  return inContext(async () => {
    const unit = createUnit()
    const found = await findOrCreateAccount(unit, { origin: 'guest', ...input })
    await unit.commit()
    return found
  })
}

async function account(id: string) {
  return (await rows<{ origin: string, name: string | null, first_signed_in_at: number | null }>('SELECT origin, name, first_signed_in_at FROM core_accounts WHERE id = ?', id))[0]
}

async function holderOf(to: string): Promise<string | undefined> {
  return (await rows<{ account_id: string }>('SELECT account_id FROM core_account_emails WHERE address = ?', to))[0]?.account_id
}

const role = (abilities: string[]) => ({ name: `Role ${crypto.randomUUID().slice(0, 6)}`, abilities, expiryRule: 'none', opensMembersArea: true })

async function makeRole(abilities: string[]): Promise<string> {
  const made = await owner.browser.post('/api/core/roles', role(abilities))
  expect(made.status).toBe(200)
  return made.body.id
}

describe('buying without signing in (ID-05)', () => {
  it('makes one unclaimed account for an address, with no session, and a second order finds it', async () => {
    const to = address()
    const first = await checkout({ address: to, name: 'Gail Guest' })
    expect(first).toEqual({ accountId: expect.any(String), created: true, claimed: false })
    expect(await account(first.accountId)).toMatchObject({ origin: 'guest', name: 'Gail Guest', first_signed_in_at: null })
    expect(await rows('SELECT count(*) AS n FROM core_sessions WHERE account_id = ?', first.accountId)).toEqual([{ n: 0 }])
    const second = await checkout({ address: ` ${to.toUpperCase()} ` })
    expect(second).toEqual({ accountId: first.accountId, created: false, claimed: false })
  })

  it('signing in later with that address claims the same account', async () => {
    const to = address()
    const { accountId } = await checkout({ address: to })
    expect(await signInByEmail(new Browser(), to)).toBe(accountId)
    expect((await account(accountId))!.first_signed_in_at).not.toBeNull()
    expect(await rows('SELECT count(*) AS n FROM core_accounts a JOIN core_account_emails e ON e.account_id = a.id WHERE e.address = ?', to)).toEqual([{ n: 1 }])
  })

  it('an unclaimed account is never the actor of a request', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    await env.DB.prepare('UPDATE core_accounts SET first_signed_in_at = NULL WHERE id = ?').bind(accountId).run()
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(false)
  })

  it('attaches to the account that verified the address, unless the caller allows only unclaimed ones', async () => {
    const to = address()
    const accountId = await signInByEmail(new Browser(), to)
    expect(await checkout({ address: to })).toEqual({ accountId, created: false, claimed: true })
    const refused = await checkout({ address: to, attach: 'unclaimed-only' }).catch(e => e)
    expect(refused.code).toBe('core.account.address-claimed')
  })

  it('an address somebody added but never verified matches nothing, and moves to a new unclaimed account', async () => {
    const typist = await signInByEmail(new Browser())
    const to = address()
    await env.DB.prepare('INSERT INTO core_account_emails (id, account_id, address, verified_at, added_by, created_at) VALUES (?, ?, ?, NULL, \'self\', ?)').bind(`aem_${crypto.randomUUID().slice(0, 12)}`, typist, to, Date.now()).run()
    const found = await checkout({ address: to })
    expect(found.created).toBe(true)
    expect(found.accountId).not.toBe(typist)
    expect(await holderOf(to)).toBe(found.accountId)
    expect(await rows('SELECT a.audience_email_id = e.id AS points FROM core_accounts a JOIN core_account_emails e ON e.account_id = a.id WHERE a.id = ?', found.accountId)).toEqual([{ points: 1 }])
  })

  it('a name with no address is an account too, which nothing can claim', async () => {
    const found = await checkout({ name: 'Door List', origin: 'staff' })
    expect(found.created).toBe(true)
    expect(await rows('SELECT count(*) AS n FROM core_account_emails WHERE account_id = ?', found.accountId)).toEqual([{ n: 0 }])
  })

  it('two checkouts for a new address at once make one account', async () => {
    const to = address()
    const [one, two] = await inContext(async () => {
      const a = createUnit()
      const b = createUnit()
      const found = [await findOrCreateAccount(a, { address: to, origin: 'guest' }), await findOrCreateAccount(b, { address: to, origin: 'guest' })]
      await a.commit()
      const lost = await b.commit().then(() => false, () => true)
      expect(lost).toBe(true)
      return found
    })
    expect(one!.accountId).not.toBe(two!.accountId)
    expect(await holderOf(to)).toBe(one!.accountId)
    expect(await rows('SELECT count(*) AS n FROM core_accounts WHERE id = ?', two!.accountId)).toEqual([{ n: 0 }])
  })
})

describe('adding and inviting people (ID-06)', () => {
  it('staff add a person by name and address; an address with an account offers that account', async () => {
    const adder = await staff()
    await grantDirectly(adder.accountId, ['core.account.create'])
    const to = address()
    const added = await adder.browser.post('/api/core/accounts', { name: 'Stan Staffadded', address: to })
    expect(added.body).toEqual({ id: expect.any(String), created: true, label: 'Stan Staffadded' })
    expect(await account(added.body.id)).toMatchObject({ origin: 'staff', first_signed_in_at: null })
    const again = await adder.browser.post('/api/core/accounts', { name: 'Someone Else', address: to })
    expect(again.body).toEqual({ id: added.body.id, created: false, label: 'Stan Staffadded' })
  })

  it('adding people needs the ability', async () => {
    const nobody = await staff()
    expect((await nobody.browser.post('/api/core/accounts', { name: 'X', address: address() })).status).toBe(403)
  })

  it('a role given to a new address waits for the first sign-in, counts for nothing until then, and works once they sign in', async () => {
    const roleId = await makeRole(['core.role.read'])
    const to = address()
    const given = await owner.browser.post('/api/core/grants', { person: { address: to, name: 'Ivy Invited' }, roleId })
    expect(given.body).toMatchObject({ id: expect.any(String), invited: true })
    const accountId = given.body.accountId
    expect(await account(accountId)).toMatchObject({ origin: 'invite', name: 'Ivy Invited', first_signed_in_at: null })
    const listed = (await owner.browser.get(`/api/core/grants?accountId=${accountId}`)).body.grants
    expect(listed.map((g: any) => g.state)).toEqual(['waiting-for-first-sign-in'])
    const tokens = await rows<{ purpose: string, account_id: string, issued_by: string, expires_at: number, created_at: number }>('SELECT purpose, account_id, issued_by, expires_at, created_at FROM core_account_tokens WHERE address = ?', to)
    expect(tokens).toEqual([expect.objectContaining({ purpose: 'invite', account_id: accountId, issued_by: owner.accountId })])
    expect(tokens[0]!.expires_at - tokens[0]!.created_at).toBe(7 * 86_400_000)

    // After the link has lapsed, an ordinary sign-in with the address still claims the account and the role.
    const browser = new Browser()
    expect(await signInByEmail(browser, to)).toBe(accountId)
    expect((await browser.get('/api/core/roles')).status).toBe(200)
    expect((await owner.browser.get(`/api/core/grants?accountId=${accountId}`)).body.grants.map((g: any) => g.state)).toEqual(['live'])
  })

  it('emails an invitation whose link signs the person in, claims the account and starts the role', async () => {
    const made = await owner.browser.post('/api/core/roles', { ...role(['core.role.read']), name: 'Front of house lead' })
    const to = address()
    const given = await owner.browser.post('/api/core/grants', { person: { address: to, name: 'Ivy Invited' }, roleId: made.body.id })
    await deliver()
    const message = mailbox.find(m => m.address === to)
    expect(message?.subject).toBe('You have been given a role at The Test Theatre')
    const browser = new Browser()
    const used = await browser.post('/api/core/sign-in/link', { token: tokenOf(message!) })
    expect(used.status).toBe(200)
    expect((await browser.get('/api/core/me')).body.account.id).toBe(given.body.accountId)
    expect((await browser.get('/api/core/roles')).status).toBe(200)
    // It works once.
    expect((await new Browser().post('/api/core/sign-in/link', { token: tokenOf(message!) })).body.code).toBe('core.sign-in.link-used')
  })

  it('the invitation\'s link is sealed: never stored in clear', async () => {
    const roleId = await makeRole(['core.role.read'])
    const to = address()
    const given = await owner.browser.post('/api/core/grants', { person: { address: to, name: 'Ivy Invited' }, roleId })
    const [before] = await rows<{ sealed_variables: string | null }>('SELECT sealed_variables FROM core_notifications WHERE type_key = \'core.invitation\' AND account_id = ?', given.body.accountId)
    expect(before!.sealed_variables).toMatch(/^v1\./)
    await deliver()
    const message = mailbox.find(m => m.address === to)!
    expect(await rows('SELECT count(*) AS n FROM core_notifications WHERE payload LIKE ?', `%${tokenOf(message)}%`)).toEqual([{ n: 0 }])
  })

  it('the invitation lasts for the invite-lifetime setting', async () => {
    await setSetting('core.sign-in.invite-lifetime', 86_400)
    const roleId = await makeRole(['core.role.read'])
    const to = address()
    await owner.browser.post('/api/core/grants', { person: { address: to, name: 'Ivy Invited' }, roleId })
    const [token] = await rows<{ expires_at: number, created_at: number }>('SELECT expires_at, created_at FROM core_account_tokens WHERE address = ?', to)
    expect(token!.expires_at - token!.created_at).toBe(86_400_000)
    await clearSetting('core.sign-in.invite-lifetime')
  })

  it('a role given by address to somebody with an account goes to that account, with no invitation', async () => {
    const roleId = await makeRole(['core.role.read'])
    const to = address()
    const accountId = await signInByEmail(new Browser(), to)
    const given = await owner.browser.post('/api/core/grants', { person: { address: to, name: 'Ignored' }, roleId })
    expect(given.body).toMatchObject({ accountId, invited: false })
    expect(await rows('SELECT count(*) AS n FROM core_account_tokens WHERE purpose = \'invite\' AND address = ?', to)).toEqual([{ n: 0 }])
  })

  it('making an account for a new address needs the ability to add people as well as to give roles', async () => {
    const granter = await staff()
    await grantDirectly(granter.accountId, ['core.grant.manage', 'core.role.read'])
    const roleId = await makeRole(['core.role.read'])
    const to = address()
    const refused = await granter.browser.post('/api/core/grants', { person: { address: to, name: 'Nobody Yet' }, roleId })
    expect(refused.status).toBe(403)
    expect(await holderOf(to)).toBeUndefined()
    // An account that already exists needs no more than the ability to give the role.
    await checkout({ address: to })
    expect((await granter.browser.post('/api/core/grants', { person: { address: to, name: 'Nobody Yet' }, roleId })).status).toBe(200)
  })

  it('takes an account id or a person, not both and not neither', async () => {
    const roleId = await makeRole(['core.role.read'])
    expect((await owner.browser.post('/api/core/grants', { roleId })).status).toBe(422)
    expect((await owner.browser.post('/api/core/grants', { roleId, accountId: owner.accountId, person: { address: address(), name: 'X' } })).status).toBe(422)
  })
})

describe('finding a person (ID-30)', () => {
  it('finds an unclaimed account by its address and shows a name, never contact details', async () => {
    const finder = await staff()
    await grantDirectly(finder.accountId, ['core.account.search'])
    const to = address()
    const { accountId } = await checkout({ address: to, name: 'Gail Guest' })
    const found = (await finder.browser.get(`/api/core/accounts?q=${encodeURIComponent(to)}`)).body.people
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: accountId, label: 'Gail Guest', claimed: false })
    expect(JSON.stringify(found)).not.toContain(to)
  })

  it('opening a person\'s page is audited', async () => {
    const { accountId } = await checkout({ address: address(), name: 'Gail Guest' })
    expect((await owner.browser.get(`/api/core/accounts/${accountId}`)).status).toBe(200)
    expect(await rows('SELECT count(*) AS n FROM core_audit WHERE action = \'read\' AND record_type = \'core.account\' AND record_id = ?', accountId)).toEqual([{ n: 1 }])
  })
})

describe('the claim link a guest is sent (sign-in review, item 2)', () => {
  it('opens the unclaimed account once, and stops working once the account has been signed in to', async () => {
    const to = address()
    const accountId = await unclaimedAccount(to)
    const links: string[] = []
    await inContext(async () => {
      for (let i = 0; i < 2; i++) {
        const unit = createUnit()
        links.push((await claimLink(unit, accountId))!)
        await unit.commit()
      }
    })
    const browser = new Browser()
    const used = await browser.post('/api/core/sign-in/link', { token: links[0]!.split('#')[1] })
    expect(used.status).toBe(200)
    expect(used.body.next).toBe('/account')
    expect((await browser.get('/api/core/me')).body.account.id).toBe(accountId)
    const second = await new Browser().post('/api/core/sign-in/link', { token: links[1]!.split('#')[1] })
    expect(second.body.code).toBe('core.sign-in.claim-spent')
    await inContext(async () => {
      expect(await claimLink(createUnit(), accountId)).toBeNull()
    })
  })
})
