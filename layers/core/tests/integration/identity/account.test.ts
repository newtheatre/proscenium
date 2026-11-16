// My account and people in the console: details, sessions, passkeys and recovery codes, the
// passkey offer, disabling and merging (ID-03, ID-11, ID-13, ID-14, ID-31, ID-32).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { accountScopeIds } from '#kit'
import { useRegistry } from '#kit/registry'
import { Authenticator } from './authenticator'
import { Browser, addPasskey, address, emailSignIn, env, goStale, grantDirectly, leaveIdentity, passkeySignIn, reset, setSetting, clearSetting, signInByEmail, staff, tokenOf, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { canonicalAccount, accountLabel } from '../../../server/identity/accounts'
import { mergePlan } from '../../../server/identity/merge'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

describe('my details (ID-11)', () => {
  it('a change of name shows at once wherever the label is used', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    expect((await browser.patch('/api/core/me', { name: 'Harriet Vane', preferredName: 'Harry' })).status).toBe(200)
    expect(await inContext(() => accountLabel(accountId))).toBe('Harry')
    await browser.patch('/api/core/me', { preferredName: null })
    expect(await inContext(() => accountLabel(accountId))).toBe('Harriet Vane')
  })

  it('keeps pronouns as optional free text, at most 40 characters, and clears them', async () => {
    const browser = new Browser()
    await signInByEmail(browser)
    expect((await browser.patch('/api/core/me', { pronouns: 'she/her' })).status).toBe(200)
    expect((await browser.get('/api/core/me')).body.account.pronouns).toBe('she/her')
    expect((await browser.patch('/api/core/me', { pronouns: 'x'.repeat(41) })).status).toBe(422)
    await browser.patch('/api/core/me', { pronouns: '' })
    expect((await browser.get('/api/core/me')).body.account.pronouns).toBeNull()
  })
})

describe('my sessions (ID-13)', () => {
  it('lists each session, marks this one, and ending one stops it on its next request', async () => {
    const to = address()
    const laptop = new Browser()
    const phone = new Browser()
    await signInByEmail(laptop, to)
    await signInByEmail(phone, to)
    const listed = (await laptop.get('/api/core/me/sessions')).body.sessions
    expect(listed).toHaveLength(2)
    expect(listed.filter((s: any) => s.current)).toHaveLength(1)
    const other = listed.find((s: any) => !s.current)
    expect((await laptop.delete(`/api/core/me/sessions/${other.id}`)).status).toBe(200)
    expect((await phone.get('/api/core/me')).body.signedIn).toBe(false)
    expect((await laptop.get('/api/core/me')).body.signedIn).toBe(true)
  })

  it('sign out everywhere else leaves only this session', async () => {
    const to = address()
    const browsers = [new Browser(), new Browser(), new Browser()]
    for (const b of browsers) await signInByEmail(b, to)
    expect((await browsers[0]!.post('/api/core/me/sessions/end-others')).status).toBe(200)
    expect((await browsers[0]!.get('/api/core/me/sessions')).body.sessions).toHaveLength(1)
    expect((await browsers[1]!.get('/api/core/me')).body.signedIn).toBe(false)
    expect((await browsers[2]!.get('/api/core/me')).body.signedIn).toBe(false)
  })

  it('cannot end somebody else\'s session', async () => {
    const mine = new Browser()
    const theirs = new Browser()
    await signInByEmail(mine)
    await signInByEmail(theirs)
    const [their] = (await theirs.get('/api/core/me/sessions')).body.sessions
    expect((await mine.delete(`/api/core/me/sessions/${their.id}`)).status).toBe(409)
    expect((await theirs.get('/api/core/me')).body.signedIn).toBe(true)
  })
})

describe('the passkey offer (ID-03)', () => {
  it('is offered after an email sign-in with no passkey, and not once there is one', async () => {
    const browser = new Browser()
    const to = address()
    const first = await emailSignIn(browser, to)
    expect((await browser.post('/api/core/sign-in/link', { token: tokenOf(first.message!) })).body.offerPasskey).toBe(true)
    const codes = await addPasskey(browser, new Authenticator())
    expect(codes).toHaveLength(10)
    expect((await browser.post('/api/core/me/recovery-codes/check', { code: codes![3]!.toUpperCase() })).body).toEqual({ matches: true })
    expect((await browser.post('/api/core/me/recovery-codes/check', { code: 'aaaaa-bbbbb' })).body).toEqual({ matches: false })
    const again = await emailSignIn(new Browser(), to)
    expect((await new Browser().post('/api/core/sign-in/link', { token: tokenOf(again.message!) })).body.offerPasskey).toBe(false)
  })

  it('tells staff with a privileged ability that the console needs a passkey', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    expect((await browser.get('/api/core/me')).body.consoleNeedsPasskey).toBe(false)
    await grantDirectly(accountId, ['core.role.manage'])
    expect((await browser.get('/api/core/me')).body.consoleNeedsPasskey).toBe(true)
  })
})

describe('my passkeys and recovery codes (ID-14)', () => {
  it('adding a passkey needs a fresh re-assertion', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    await goStale(accountId)
    expect((await browser.post('/api/core/me/passkeys/options')).body.code).toBe('core.access.not-fresh')
  })

  it('removing a passkey needs a fresh re-assertion', async () => {
    const { browser, accountId } = await staff()
    await addPasskey(browser, new Authenticator())
    const [first] = (await browser.get('/api/core/me/passkeys')).body.passkeys
    await goStale(accountId)
    expect((await browser.delete(`/api/core/me/passkeys/${first.id}`)).body.code).toBe('core.access.not-fresh')
  })

  it('the only way in cannot be removed', async () => {
    const { browser: locked } = await staff()
    await setSetting('core.sign-in.email-link', false)
    try {
      const browser = locked
      const [only] = (await browser.get('/api/core/me/passkeys')).body.passkeys
      const refused = await browser.delete(`/api/core/me/passkeys/${only.id}`)
      expect(refused.status).toBe(409)
      expect(refused.body.code).toBe('core.passkey.only-way-in')
    }
    finally {
      await clearSetting('core.sign-in.email-link')
    }
    // With a verified address that may receive links, the last passkey may go.
    const { browser } = await staff()
    const [only] = (await browser.get('/api/core/me/passkeys')).body.passkeys
    expect((await browser.delete(`/api/core/me/passkeys/${only.id}`)).status).toBe(200)
  })

  it('making new recovery codes ends the old set', async () => {
    const browser = new Browser()
    await signInByEmail(browser)
    const old = await addPasskey(browser, new Authenticator())
    const fresh = (await browser.post('/api/core/me/recovery-codes')).body.recoveryCodes
    expect(fresh).toHaveLength(10)
    expect((await browser.post('/api/core/me/recovery-codes/check', { code: old![0] })).body.matches).toBe(false)
    expect((await browser.post('/api/core/me/recovery-codes/check', { code: fresh[0] })).body.matches).toBe(true)
  })
})

describe('disabling an account (ID-31)', () => {
  it('ends every session in the same batch, stops new ones, and tells the person only once they prove the address', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.account.disable'])
    const to = address()
    const person = new Browser()
    const personId = await signInByEmail(person, to)
    const disabled = await admin.browser.post(`/api/core/accounts/${personId}/disable`, { reason: 'conduct' })
    expect(disabled.status).toBe(200)
    expect(await rows('SELECT count(*) AS n FROM core_sessions WHERE account_id = ? AND ended_at IS NULL', personId)).toEqual([{ n: 0 }])
    expect((await person.get('/api/core/me')).body.signedIn).toBe(false)
    const asked = await emailSignIn(new Browser(), to)
    expect(asked.body).toEqual({ sent: true })
    const tried = await new Browser().post('/api/core/sign-in/link', { token: tokenOf(asked.message!) })
    expect(tried.body.code).toBe('core.account.disabled')
  })

  it('staff cannot disable themselves', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.account.disable'])
    const refused = await admin.browser.post(`/api/core/accounts/${admin.accountId}/disable`, { reason: 'requested' })
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('core.access.own-record')
  })
})

describe('merging two accounts (ID-32)', () => {
  it('new account-referencing column must declare its merge rule: the plan covers every one', async () => {
    const plan = await inContext(async () => mergePlan())
    const declared: string[] = []
    for (const [name, { meta }] of useRegistry().tables as Map<string, any>) {
      for (const { sql, meta: column } of Object.values(meta.columns) as any[]) if (column.account) declared.push(`${name}.${sql}`)
    }
    expect(plan.map(s => `${s.table}.${s.column}`).sort()).toEqual(declared.sort())
  })

  it('moves addresses, passkeys and grants, ends the old sessions, and every reference resolves to the survivor', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.account.merge'])
    const survivorBrowser = new Browser()
    const survivorId = await signInByEmail(survivorBrowser)
    const mergedBrowser = new Browser()
    const mergedDevice = new Authenticator()
    const mergedAddress = address()
    const mergedAccountId = await signInByEmail(mergedBrowser, mergedAddress)
    await addPasskey(mergedBrowser, mergedDevice)
    const { roleId } = await grantDirectly(mergedAccountId, ['core.role.read'])

    const preview = await admin.browser.get(`/api/core/accounts/merge?survivorId=${survivorId}&mergedAccountId=${mergedAccountId}`)
    expect(preview.status).toBe(200)
    expect(preview.body.moves.map((m: any) => m.table)).toEqual(expect.arrayContaining(['core_account_emails', 'core_passkeys']))

    const merged = await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })
    expect(merged.status).toBe(200)
    expect(await rows('SELECT account_id FROM core_account_emails WHERE address = ?', mergedAddress)).toEqual([{ account_id: survivorId }])
    expect(await rows('SELECT account_id FROM core_passkeys WHERE account_id = ?', mergedAccountId)).toEqual([])
    expect((await mergedBrowser.get('/api/core/me')).body.signedIn).toBe(false)
    expect(await inContext(() => canonicalAccount(mergedAccountId))).toBe(survivorId)
    // The grant moved: the survivor holds the role, the old one's grant ended as merged.
    expect(await rows('SELECT role_id FROM core_grants g WHERE account_id = ? AND NOT EXISTS (SELECT 1 FROM core_grant_ends e WHERE e.grant_id = g.id)', survivorId)).toEqual([{ role_id: roleId }])
    // The moved passkey now signs in to the survivor.
    const again = new Browser()
    expect((await passkeySignIn(again, mergedDevice)).status).toBe(200)
    expect((await again.get('/api/core/me')).body.account.id).toBe(survivorId)
    // Every move column of the plan points at the survivor now.
    for (const step of (await inContext(async () => mergePlan())).filter(s => s.action === 'move'))
      expect(await rows(`SELECT 1 FROM "${step.table}" WHERE "${step.column}" = ?`, mergedAccountId), `${step.table}.${step.column}`).toEqual([])
  })

  it('a chain of merges keeps every account pointing at the final survivor, so its scope reaches them all', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.account.merge'])
    const a = await signInByEmail(new Browser())
    const b = await signInByEmail(new Browser())
    const c = await signInByEmail(new Browser())
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId: b, mergedAccountId: a })).status).toBe(200)
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId: c, mergedAccountId: b })).status).toBe(200)
    expect(await rows('SELECT id, merged_into_id FROM core_accounts WHERE id IN (?, ?) ORDER BY id', a, b)).toEqual([a, b].sort().map(id => ({ id, merged_into_id: c })))
    expect((await inContext(() => accountScopeIds(c))).sort()).toEqual([a, b, c].sort())
    // A's re-pointing is listed with the second merge, so undoing it can put A back on B.
    const [second] = await rows<{ id: string }>('SELECT id FROM core_account_merges WHERE merged_account_id = ?', b)
    expect(await rows('SELECT table_name, column_name, action FROM core_account_merge_items WHERE merge_id = ? AND table_name = \'core_accounts\'', second!.id)).toEqual([{ table_name: 'core_accounts', column_name: 'merged_into_id', action: 'moved' }])
  })

  it('merge refuses a tombstone and itself', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.account.merge'])
    const a = await signInByEmail(new Browser())
    const b = await signInByEmail(new Browser())
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId: a, mergedAccountId: a })).body.code).toBe('core.merge.same')
    await env.DB.prepare('UPDATE core_accounts SET name = NULL, preferred_name = NULL, last_signed_in_at = NULL, anonymised_at = 1 WHERE id = ?').bind(b).run()
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId: a, mergedAccountId: b })).body.code).toBe('core.merge.erased')
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId: b, mergedAccountId: a })).body.code).toBe('core.merge.erased')
  })

  it('merge is all or nothing: a failure leaves both accounts as they were', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.account.merge'])
    const survivorId = await signInByEmail(new Browser())
    const to = address()
    const mergedAccountId = await signInByEmail(new Browser(), to)
    await env.DB.prepare('CREATE TRIGGER test_fail_merge BEFORE UPDATE OF merged_into_id ON core_accounts BEGIN SELECT RAISE(ABORT, \'boom\'); END').run()
    try {
      const failed = await admin.browser.post('/api/core/accounts/merge', { survivorId, mergedAccountId })
      expect(failed.status).toBe(500)
    }
    finally {
      await env.DB.prepare('DROP TRIGGER test_fail_merge').run()
    }
    expect(await rows('SELECT account_id FROM core_account_emails WHERE address = ?', to)).toEqual([{ account_id: mergedAccountId }])
    expect(await rows('SELECT count(*) AS n FROM core_account_merges WHERE merged_account_id = ?', mergedAccountId)).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM core_sessions WHERE account_id = ? AND ended_at IS NULL', mergedAccountId)).toEqual([{ n: 1 }])
  })

  it('staff cannot merge their own account', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.account.merge'])
    const other = await signInByEmail(new Browser())
    expect((await admin.browser.post('/api/core/accounts/merge', { survivorId: other, mergedAccountId: admin.accountId })).body.code).toBe('core.access.own-record')
  })
})

describe('the database keeps accounts', () => {
  it('an account is never deleted, and nothing personal is written to a tombstone', async () => {
    const id = await signInByEmail(new Browser())
    await expect(env.DB.prepare('DELETE FROM core_accounts WHERE id = ?').bind(id).run()).rejects.toThrow(/never deleted/)
    await env.DB.prepare('UPDATE core_accounts SET name = NULL, preferred_name = NULL, last_signed_in_at = NULL, anonymised_at = 1 WHERE id = ?').bind(id).run()
    await expect(env.DB.prepare('UPDATE core_accounts SET name = \'Back again\' WHERE id = ?').bind(id).run()).rejects.toThrow(/erased account/)
    await expect(env.DB.prepare('UPDATE core_accounts SET pronouns = \'they/them\' WHERE id = ?').bind(id).run()).rejects.toThrow(/erased account/)
  })
})
