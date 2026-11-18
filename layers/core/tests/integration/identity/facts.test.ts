// Mapping abilities to facts (ID-22; identity spec part 6, Facts): edited like a role, nobody maps
// what they do not hold, and a privileged ability counts only once the theatre confirms it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { grantDirectly, leaveIdentity, reset, staff, useIdentity } from './helpers'
import { inContext, rows, setModule } from '../../../../../tests/integration/helpers'
import { factAbilityMap } from '../../../server/identity/grants'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(async () => {
  reset()
  const { env } = await import('./helpers')
  await env.DB.prepare('DELETE FROM core_fact_abilities').run()
})

describe('facts', () => {
  it('lists each declared fact with what is mapped to it, and the abilities the editor holds', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.role.read', 'core.account.read'])
    const read = await admin.browser.get('/api/core/facts')
    expect(read.status).toBe(200)
    expect(read.body.facts.map((f: { name: string }) => f.name)).toContain('core.member')
    const catalogue = new Map(read.body.catalogue.map((a: { name: string, held: boolean }) => [a.name, a.held]))
    expect(catalogue.get('core.account.read')).toBe(true)
    expect(catalogue.get('core.account.merge')).toBe(false)
  })

  it('maps abilities the editor holds, with what they imply, and refuses one they do not', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.role.manage'])
    expect((await admin.browser.put('/api/core/facts/core.member', { abilities: ['core.role.read'] })).status).toBe(200)
    expect(await rows('SELECT ability FROM core_fact_abilities WHERE fact = \'core.member\'')).toEqual([{ ability: 'core.role.read' }])
    const refused = await admin.browser.put('/api/core/facts/core.member', { abilities: ['core.account.merge'] })
    expect(refused.body.code).toBe('core.role.not-held')
  })

  it('a privileged ability is mapped only once confirmed, and only then counts', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.role.manage'])
    const unconfirmed = await admin.browser.put('/api/core/facts/core.member', { abilities: ['core.role.manage'] })
    expect(unconfirmed.body.code).toBe('core.fact.confirm-privileged')
    expect((await admin.browser.put('/api/core/facts/core.member', { abilities: ['core.role.manage'], confirmPrivileged: true })).status).toBe(200)
    expect((await inContext(() => factAbilityMap()))['core.member']).toEqual(expect.arrayContaining(['core.role.manage', 'core.role.read']))
    // Saving again keeps the confirmation without asking twice.
    expect((await admin.browser.put('/api/core/facts/core.member', { abilities: ['core.role.manage'] })).status).toBe(200)
  })

  it('refuses a fact nobody declared', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.role.manage'])
    expect((await admin.browser.put('/api/core/facts/core.nothing', { abilities: [] })).status).toBe(404)
  })
})

describe('what a module brings when it is switched on (FH-4)', () => {
  it('maps its facts\' defaults and makes its preset roles once, leaving the theatre\'s own alone', async () => {
    const { env } = await import('./helpers')
    const { ensureModuleDefaults } = await import('../../../server/identity/defaults')
    await setModule('front-of-house', true)
    await env.DB.prepare('DELETE FROM core_roles WHERE key IN (\'volunteer\', \'front-of-house-manager\')').run()
    await env.DB.prepare('INSERT INTO core_fact_abilities (fact, ability, pinned_record, created_by, created_at) VALUES (\'front-of-house.rostered\', \'front-of-house.shift.sign-up\', \'\', \'acc_test\', 1)').run()
    const made = await inContext(() => ensureModuleDefaults('front-of-house', 'acc_test'))
    expect(made).toEqual({ facts: 2, roles: 2 })
    const leading = (await rows<{ ability: string }>('SELECT ability FROM core_fact_abilities WHERE fact = \'front-of-house.leading-shift\' ORDER BY ability')).map(r => r.ability)
    expect(leading).toEqual(expect.arrayContaining(['front-of-house.assignment.check-in', 'front-of-house.night-report.sign-off', 'front-of-house.night-report.write', 'front-of-house.shift.view']))
    // The theatre's own mapping stands.
    expect(await rows('SELECT ability FROM core_fact_abilities WHERE fact = \'front-of-house.rostered\'')).toEqual([{ ability: 'front-of-house.shift.sign-up' }])
    const [volunteer] = await rows<{ id: string, name: string, opens_members_area: number, preset: string }>('SELECT id, name, opens_members_area, preset FROM core_roles WHERE key = \'volunteer\'')
    expect(volunteer).toMatchObject({ name: 'Volunteer', opens_members_area: 1, preset: 'front-of-house.volunteer' })
    expect((await rows('SELECT ability FROM core_role_abilities WHERE role_id = ?', volunteer!.id)).length).toBeGreaterThan(0)
    // Twice makes nothing more.
    expect(await inContext(() => ensureModuleDefaults('front-of-house', 'acc_test'))).toEqual({ facts: 0, roles: 0 })
  })
})
