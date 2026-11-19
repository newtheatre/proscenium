// Staff edit somebody's account (ID-46): details at once, addresses only through their link, every
// change audited by field and every new way in told to the person.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Browser, address, deliver, env, grantDirectly, leaveIdentity, reset, signInByEmail, staff, unclaimedAccount, useIdentity } from './helpers'
import { rows } from '../../../../../tests/integration/helpers'
import { setMailer, useMailer, type OutgoingEmail } from '../../../server/notifications/mailer'

const sent: OutgoingEmail[] = []
const to = (addressee: string) => sent.filter(e => e.to === addressee)
const linkIn = (email: OutgoingEmail | undefined) => /(https?:\/\/\S+#[\w-]+)/.exec(email?.text ?? '')?.[1] ?? ''
const fragment = (link: string) => link.split('#')[1]!

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

async function editor() {
  const desk = await staff()
  await grantDirectly(desk.accountId, ['core.account.update'])
  return desk
}

const addressesOf = async (accountId: string) => rows<{ id: string, address: string, verified_at: number | null, added_by: string }>('SELECT id, address, verified_at, added_by FROM core_account_emails WHERE account_id = ? ORDER BY created_at', accountId)

describe('staff change a person\'s details (ID-46)', () => {
  it('changes the name, known-as name and pronouns, and audits which fields changed but never the words', async () => {
    const desk = await editor()
    const personId = await signInByEmail(new Browser())
    const changed = await desk.browser.patch(`/api/core/accounts/${personId}`, { name: 'Harriet Vane', preferredName: 'Harry', pronouns: 'she/her' })
    expect(changed.status).toBe(200)
    const shown = (await desk.browser.get(`/api/core/accounts/${personId}`)).body
    expect({ name: shown.name, preferredName: shown.preferredName, pronouns: shown.pronouns }).toEqual({ name: 'Harriet Vane', preferredName: 'Harry', pronouns: 'she/her' })
    const [audit] = await rows<{ detail: string, ability: string }>('SELECT detail, ability FROM core_audit WHERE action = \'update\' AND record_id = ? AND actor_account_id = ?', personId, desk.accountId)
    expect(audit!.ability).toBe('core.account.update')
    expect(JSON.parse(audit!.detail).fields.sort()).toEqual(['name', 'preferredName', 'pronouns'])
    expect(audit!.detail).not.toContain('Harriet')
  })

  it('clears the optional fields, keeps the same limits as a person\'s own details, and never empties the name', async () => {
    const desk = await editor()
    const personId = await signInByEmail(new Browser())
    await desk.browser.patch(`/api/core/accounts/${personId}`, { name: 'Peter Wimsey', pronouns: 'he/him' })
    expect((await desk.browser.patch(`/api/core/accounts/${personId}`, { pronouns: null })).status).toBe(200)
    expect((await desk.browser.get(`/api/core/accounts/${personId}`)).body.pronouns).toBeNull()
    expect((await desk.browser.patch(`/api/core/accounts/${personId}`, { pronouns: 'x'.repeat(41) })).status).toBe(422)
    expect((await desk.browser.patch(`/api/core/accounts/${personId}`, { name: '' })).status).toBe(422)
  })

  it('names a nameless account, such as one a guest checkout made', async () => {
    const desk = await editor()
    const personId = await unclaimedAccount()
    expect((await desk.browser.patch(`/api/core/accounts/${personId}`, { name: 'Gail Guest' })).status).toBe(200)
    expect((await rows('SELECT name FROM core_accounts WHERE id = ?', personId))).toEqual([{ name: 'Gail Guest' }])
  })

  it('needs core.account.update, and refuses an erased or merged-away account', async () => {
    const reader = await staff()
    await grantDirectly(reader.accountId, ['core.account.read'])
    const personId = await signInByEmail(new Browser())
    expect((await reader.browser.patch(`/api/core/accounts/${personId}`, { name: 'Nobody' })).status).toBe(403)
    expect((await reader.browser.get(`/api/core/accounts/${personId}`)).body.actions.update).toBe(false)

    const desk = await editor()
    expect((await desk.browser.get(`/api/core/accounts/${personId}`)).body.actions.update).toBe(true)
    await env.DB.prepare('UPDATE core_accounts SET anonymised_at = ? WHERE id = ?').bind(Date.now(), personId).run()
    expect((await desk.browser.patch(`/api/core/accounts/${personId}`, { name: 'Back again' })).status).toBe(404)
  })
})

describe('staff add an address for a person (ID-46)', () => {
  it('adds it unverified, sends its link, and tells every verified address that a way in was added by staff', async () => {
    const desk = await editor()
    const own = address()
    const personId = await signInByEmail(new Browser(), own)
    const extra = address()
    const added = await desk.browser.post(`/api/core/accounts/${personId}/addresses`, { address: extra })
    expect(added.status).toBe(200)
    await deliver()
    const row = (await addressesOf(personId)).find(a => a.address === extra)!
    expect(row.verified_at).toBeNull()
    expect(row.added_by).toBe('staff')
    const [verify] = to(extra)
    expect(verify!.subject).toBe('Confirm your email address for The Test Theatre')
    const told = to(own).find(e => e.subject === 'Your sign-in at The Test Theatre has changed')
    expect(told!.text).toContain('a new email address')
    expect(told!.text).toContain('the theatre\'s staff')
    expect((await new Browser().post('/api/core/me/addresses/verify', { token: fragment(linkIn(verify)) })).status).toBe(200)
    expect((await addressesOf(personId)).find(a => a.address === extra)!.verified_at).not.toBeNull()
    const [audit] = await rows<{ detail: string }>('SELECT detail FROM core_audit WHERE action = \'create\' AND record_id = ? AND actor_account_id = ?', personId, desk.accountId)
    expect(JSON.parse(audit!.detail)).toEqual({ emailId: row.id })
  })

  it('refuses an address another account holds, naming that account so staff can merge them', async () => {
    const desk = await editor()
    const personId = await signInByEmail(new Browser())
    const theirs = address()
    const otherId = await unclaimedAccount(theirs)
    const refused = await desk.browser.post(`/api/core/accounts/${personId}/addresses`, { address: theirs })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('core.address.on-another-account')
    expect(refused.body.detail).toEqual({ accountId: otherId })
    expect(await addressesOf(otherId)).toHaveLength(1)
  })

  it('refuses an address already on the account once it is verified, and sends an unverified one\'s link again', async () => {
    const desk = await editor()
    const own = address()
    const personId = await unclaimedAccount(own)
    expect((await desk.browser.post(`/api/core/accounts/${personId}/addresses`, { address: own })).status).toBe(200)
    await deliver()
    expect(to(own).map(e => e.subject)).toContain('Confirm your email address for The Test Theatre')
    const verified = address()
    const claimedId = await signInByEmail(new Browser(), verified)
    expect((await desk.browser.post(`/api/core/accounts/${claimedId}/addresses`, { address: verified })).body.code).toBe('core.address.already-yours')
  })
})

describe('staff manage a person\'s addresses (ID-46)', () => {
  it('makes a verified address the one the theatre writes to and tells the old one; never an unverified one', async () => {
    const desk = await editor()
    const own = address()
    const personId = await signInByEmail(new Browser(), own)
    const extra = address()
    await desk.browser.post(`/api/core/accounts/${personId}/addresses`, { address: extra })
    await deliver()
    const extraId = (await addressesOf(personId)).find(a => a.address === extra)!.id
    expect((await desk.browser.put(`/api/core/accounts/${personId}/addresses/${extraId}`, { use: 'audience' })).body.code).toBe('core.address.unverified')
    await new Browser().post('/api/core/me/addresses/verify', { token: fragment(linkIn(to(extra)[0])) })
    sent.length = 0
    expect((await desk.browser.put(`/api/core/accounts/${personId}/addresses/${extraId}`, { use: 'audience' })).status).toBe(200)
    await deliver()
    expect(await rows('SELECT audience_email_id AS id FROM core_accounts WHERE id = ?', personId)).toEqual([{ id: extraId }])
    expect(to(own).map(e => e.subject)).toContain('Your email address at The Test Theatre has changed')
    const shown = (await desk.browser.get(`/api/core/accounts/${personId}`)).body.addresses
    expect(shown.find((a: any) => a.id === extraId).audience).toBe(true)
  })

  it('removes an address, but never the one written to or the last verified one', async () => {
    const desk = await editor()
    const own = address()
    const personId = await signInByEmail(new Browser(), own)
    const ownId = (await addressesOf(personId))[0]!.id
    expect((await desk.browser.delete(`/api/core/accounts/${personId}/addresses/${ownId}`)).body.code).toBe('core.address.in-use')
    const typo = address()
    await desk.browser.post(`/api/core/accounts/${personId}/addresses`, { address: typo })
    const typoId = (await addressesOf(personId)).find(a => a.address === typo)!.id
    expect((await desk.browser.delete(`/api/core/accounts/${personId}/addresses/${typoId}`)).status).toBe(200)
    expect((await addressesOf(personId)).map(a => a.address)).toEqual([own])
    const [audit] = await rows<{ detail: string }>('SELECT detail FROM core_audit WHERE action = \'delete\' AND record_id = ? AND actor_account_id = ?', personId, desk.accountId)
    expect(JSON.parse(audit!.detail)).toEqual({ emailId: typoId })
  })

  it('cannot touch an address on somebody else\'s account through this one', async () => {
    const desk = await editor()
    const personId = await signInByEmail(new Browser())
    const otherId = await signInByEmail(new Browser())
    const otherAddressId = (await addressesOf(otherId))[0]!.id
    expect((await desk.browser.delete(`/api/core/accounts/${personId}/addresses/${otherAddressId}`)).status).toBe(404)
    expect(await addressesOf(otherId)).toHaveLength(1)
  })
})
