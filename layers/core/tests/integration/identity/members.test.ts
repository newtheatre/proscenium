// The members' side (ID-18 to ID-21): standings, the fact core.member and what the viewer is shown;
// and emergency contacts, for members only (ID-17).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUnit } from '#kit/unit'
import { Authenticator } from './authenticator'
import { Browser, clearSetting, env, grantDirectly, leaveIdentity, reset, setSetting, setUpOwner, signInByEmail, staff, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { standingHolders, standingOf } from '../../../server/identity/standings'
import { sweepEmergencyContacts } from '../../../server/identity/emergency-contacts'

let owner: { browser: Browser, device: Authenticator, accountId: string }

beforeAll(async () => {
  useIdentity()
  const browser = new Browser()
  const device = new Authenticator()
  owner = { browser, device, accountId: await setUpOwner(browser, device) }
})
afterAll(leaveIdentity)
beforeEach(reset)

/** A role with no abilities that opens the members' area, given directly: a volunteer. */
async function giveStanding(accountId: string): Promise<{ roleId: string, grantId: string }> {
  return grantDirectly(accountId, [])
}

async function endGrant(grantId: string): Promise<void> {
  await env.DB.prepare('INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) VALUES (?, ?, NULL, \'revoked\')').bind(grantId, Date.now()).run()
}

const sides = async (browser: Browser) => (await browser.get('/api/core/viewer')).body.sides

describe('standings and the members\' side (ID-18 to ID-21)', () => {
  it('an audience member has the audience side only, and members\' pages answer as missing', async () => {
    const browser = new Browser()
    await signInByEmail(browser)
    expect(await sides(browser)).toEqual(['audience'])
    expect((await browser.get('/api/core/navigation?shell=members')).status).toBe(404)
    expect((await browser.get('/api/core/me/emergency-contacts')).status).toBe(404)
  })

  it('the members\' side opens on the next request after a standing begins, with no sign-out', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    expect(await sides(browser)).toEqual(['audience'])
    await giveStanding(accountId)
    expect(await sides(browser)).toContain('members')
  })

  it('losing the last standing closes the members\' side quietly and keeps the person signed in', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    const { grantId } = await giveStanding(accountId)
    expect(await sides(browser)).toContain('members')
    await endGrant(grantId)
    expect(await sides(browser)).toEqual(['audience'])
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(true)
  })

  it('a role that does not open the members\' area gives no standing', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    const { roleId } = await giveStanding(accountId)
    await env.DB.prepare('UPDATE core_roles SET opens_members_area = 0 WHERE id = ?').bind(roleId).run()
    expect(await sides(browser)).toEqual(['audience'])
  })

  it('with the members\' area switched off nobody has the members\' side, though the standing is still there', async () => {
    const browser = new Browser()
    const accountId = await signInByEmail(browser)
    await giveStanding(accountId)
    await setSetting('core.members-area.enabled', false)
    expect(await sides(browser)).toEqual(['audience'])
    expect(await inContext(() => standingOf(accountId))).toHaveLength(1)
    await clearSetting('core.members-area.enabled')
  })

  it('standingOf names each standing\'s source, and standingHolders lists everybody holding one', async () => {
    const accountId = await signInByEmail(new Browser())
    const { roleId } = await giveStanding(accountId)
    const [role] = await rows<{ key: string, name: string }>('SELECT key, name FROM core_roles WHERE id = ?', roleId)
    expect(await inContext(() => standingOf(accountId))).toEqual([{ source: `role:${role!.key}`, label: role!.name }])
    const holders = await inContext(() => standingHolders())
    expect(holders.complete).toBe(true)
    expect(holders.accountIds).toContain(accountId)
    expect(holders.accountIds).toContain(owner.accountId)
  })
})

const contact = { name: 'Rita Ringme', relationship: 'Sister', phone: '+44 7700 900123' }

async function member(): Promise<{ browser: Browser, accountId: string, grantId: string }> {
  const browser = new Browser()
  const accountId = await signInByEmail(browser)
  const { grantId } = await giveStanding(accountId)
  return { browser, accountId, grantId }
}

async function welfareLead() {
  const lead = await staff()
  const { roleId } = await grantDirectly(lead.accountId, ['core.emergency-contact.read'])
  const [role] = await rows<{ name: string }>('SELECT name FROM core_roles WHERE id = ?', roleId)
  return { ...lead, roleName: role!.name }
}

describe('emergency contacts (ID-17)', () => {
  it('a member records up to three, having told them; without a standing the write is refused as missing', async () => {
    const { browser } = await member()
    expect((await browser.put('/api/core/me/emergency-contacts', { contacts: [contact] })).status).toBe(422)
    expect((await browser.put('/api/core/me/emergency-contacts', { contacts: [contact, contact, contact, contact], told: true })).status).toBe(422)
    expect((await browser.put('/api/core/me/emergency-contacts', { contacts: [contact, { name: 'Bob', phone: '01632 960001' }], told: true })).status).toBe(200)
    const mine = (await browser.get('/api/core/me/emergency-contacts')).body
    expect(mine.contacts).toEqual([contact, { name: 'Bob', relationship: null, phone: '01632 960001' }])
    expect(mine.reads).toEqual([])

    const outsider = new Browser()
    await signInByEmail(outsider)
    expect((await outsider.put('/api/core/me/emergency-contacts', { contacts: [contact], told: true })).status).toBe(404)
  })

  it('the welfare lead reads one person\'s contacts with a reason; the read is audited and shown to the person', async () => {
    const person = await member()
    await person.browser.put('/api/core/me/emergency-contacts', { contacts: [contact], told: true })
    const lead = await welfareLead()
    expect((await lead.browser.get(`/api/core/accounts/${person.accountId}/emergency-contacts`)).status).toBe(422)
    const read = await lead.browser.get(`/api/core/accounts/${person.accountId}/emergency-contacts?reason=incident`)
    expect(read.status).toBe(200)
    expect(read.body.contacts).toEqual([contact])
    const audit = await rows<{ action: string, ability: string, detail: string, actor_account_id: string }>('SELECT action, ability, detail, actor_account_id FROM core_audit WHERE record_type = \'core.account\' AND record_id = ? AND ability = \'core.emergency-contact.read\'', person.accountId)
    expect(audit).toEqual([{ action: 'read', ability: 'core.emergency-contact.read', detail: JSON.stringify({ reason: 'incident', found: true }), actor_account_id: lead.accountId }])
    const reads = (await person.browser.get('/api/core/me/emergency-contacts')).body.reads
    expect(reads).toEqual([{ at: expect.any(Number), capacity: lead.roleName, reason: 'incident' }])
  })

  it('an Owner does not hold the ability by being an Owner, but can still give it', async () => {
    const person = await member()
    expect((await owner.browser.get(`/api/core/accounts/${person.accountId}/emergency-contacts?reason=emergency`)).status).toBe(403)
    const roles = (await owner.browser.get('/api/core/roles')).body.roles
    expect(roles.find((r: any) => r.key === 'owner').abilities).not.toContain('core.emergency-contact.read')
    const made = await owner.browser.post('/api/core/roles', { name: 'Welfare lead', abilities: ['core.emergency-contact.read'], expiryRule: 'none', opensMembersArea: true })
    const lead = await staff()
    expect((await owner.browser.post('/api/core/grants', { accountId: lead.accountId, roleId: made.body.id })).status).toBe(200)
  })

  it('reads stop on the request after the last standing ends', async () => {
    const person = await member()
    await person.browser.put('/api/core/me/emergency-contacts', { contacts: [contact], told: true })
    const lead = await welfareLead()
    await endGrant(person.grantId)
    expect((await lead.browser.get(`/api/core/accounts/${person.accountId}/emergency-contacts?reason=welfare-follow-up`)).body.contacts).toEqual([])
    expect((await person.browser.get('/api/core/me/emergency-contacts')).status).toBe(404)
  })

  it('the sweep deletes the contacts once the keeping time has passed after the last standing, and not before', async () => {
    const sweep = () => inContext(async () => {
      const unit = createUnit()
      await sweepEmergencyContacts(unit)
      await unit.commit()
    })
    const count = async (accountId: string) => (await rows<{ n: number }>('SELECT count(*) AS n FROM core_emergency_contacts WHERE account_id = ?', accountId))[0]!.n
    const person = await member()
    await person.browser.put('/api/core/me/emergency-contacts', { contacts: [contact], told: true })
    await sweep()
    expect(await count(person.accountId)).toBe(1)
    await endGrant(person.grantId)
    await sweep()
    expect(await count(person.accountId)).toBe(1)
    // A standing that returns within the keeping time clears the mark.
    const again = await giveStanding(person.accountId)
    await sweep()
    expect(await rows('SELECT standing_lost_at FROM core_emergency_contacts WHERE account_id = ?', person.accountId)).toEqual([{ standing_lost_at: null }])
    await endGrant(again.grantId)
    await sweep()
    await env.DB.prepare('UPDATE core_emergency_contacts SET standing_lost_at = ? WHERE account_id = ?').bind(Date.now() - 31 * 86_400_000, person.accountId).run()
    await sweep()
    expect(await count(person.accountId)).toBe(0)
  })
})
