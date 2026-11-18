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
  await env.DB.prepare('DELETE FROM core_module_defaults').run()
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

describe('defaults for modules already on, after a deploy (FH-4)', () => {
  const PRESET_KEYS = ['volunteer', 'front-of-house-manager']

  /** A site past setup whose front of house was switched on before its defaults shipped. */
  async function switchedOnBefore(): Promise<void> {
    const { env } = await import('./helpers')
    const [owner] = await rows<{ id: string }>('SELECT id FROM core_roles WHERE key = \'owner\'')
    const { accountId } = await staff()
    await grantDirectly(accountId, [], owner ? { roleId: owner.id } : { roleKey: 'owner' })
    await setModule('front-of-house', true)
    await env.DB.prepare('DELETE FROM core_role_abilities WHERE role_id IN (SELECT id FROM core_roles WHERE key IN (SELECT value FROM json_each(?)))').bind(JSON.stringify(PRESET_KEYS)).run()
    await env.DB.prepare('DELETE FROM core_roles WHERE key IN (SELECT value FROM json_each(?))').bind(JSON.stringify(PRESET_KEYS)).run()
  }

  const runTask = async () => {
    const task = (await import('../../../server/tasks/module-defaults')).default
    await inContext(() => (task as unknown as () => Promise<void>)(), { kind: 'job' })
  }
  const presetRoles = async () => (await rows<{ key: string }>('SELECT key FROM core_roles WHERE key IN (SELECT value FROM json_each(?)) ORDER BY key', JSON.stringify(PRESET_KEYS))).map(r => r.key)
  const leadingShift = async () => (await rows('SELECT ability FROM core_fact_abilities WHERE fact = \'front-of-house.leading-shift\'')).length

  it('the hourly task gives a module that is already on its preset roles and fact mappings', async () => {
    await switchedOnBefore()
    await runTask()
    expect(await presetRoles()).toEqual(['front-of-house-manager', 'volunteer'])
    const [volunteer] = await rows<{ id: string, preset: string }>('SELECT id, preset FROM core_roles WHERE key = \'volunteer\'')
    expect(volunteer!.preset).toBe('front-of-house.volunteer')
    expect((await rows('SELECT ability FROM core_role_abilities WHERE role_id = ?', volunteer!.id)).length).toBeGreaterThan(0)
    expect(await leadingShift()).toBeGreaterThan(0)
    const offered = await rows<{ kind: string, key: string }>('SELECT kind, key FROM core_module_defaults WHERE module_id = \'front-of-house\'')
    expect(offered).toEqual(expect.arrayContaining([{ kind: 'role', key: 'front-of-house.volunteer' }, { kind: 'role', key: 'front-of-house.manager' }, { kind: 'fact', key: 'front-of-house.leading-shift' }]))
  })

  it('running twice makes nothing new', async () => {
    const { ensureEnabledModuleDefaults } = await import('../../../server/identity/defaults')
    await switchedOnBefore()
    await runTask()
    const count = async () => (await rows<{ n: number }>('SELECT (SELECT count(*) FROM core_roles) + (SELECT count(*) FROM core_role_abilities) + (SELECT count(*) FROM core_fact_abilities) + (SELECT count(*) FROM core_module_defaults) AS n'))[0]!.n
    const before = await count()
    expect(await inContext(() => ensureEnabledModuleDefaults())).toEqual({ facts: 0, roles: 0 })
    await runTask()
    expect(await count()).toBe(before)
  })

  it('a preset role or default mapping the theatre removed is not made again', async () => {
    const { env } = await import('./helpers')
    const { ensureModuleDefaults } = await import('../../../server/identity/defaults')
    await switchedOnBefore()
    await runTask()
    await env.DB.prepare('DELETE FROM core_role_abilities WHERE role_id IN (SELECT id FROM core_roles WHERE key = \'volunteer\')').run()
    await env.DB.prepare('DELETE FROM core_roles WHERE key = \'volunteer\'').run()
    await env.DB.prepare('DELETE FROM core_fact_abilities WHERE fact = \'front-of-house.leading-shift\'').run()
    await runTask()
    // Switching the module off and on again offers nothing either.
    expect(await inContext(() => ensureModuleDefaults('front-of-house', 'acc_test'))).toEqual({ facts: 0, roles: 0 })
    expect(await presetRoles()).toEqual(['front-of-house-manager'])
    expect(await leadingShift()).toBe(0)
  })

  it('a preset role the theatre already has, renamed, is left as it is and counted as offered', async () => {
    const { env } = await import('./helpers')
    await switchedOnBefore()
    await env.DB.prepare('INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES (\'rol_ownvolunteer\', \'volunteer\', \'Usher\', 0, 0, 0, \'none\', 1)').run()
    await runTask()
    expect(await rows('SELECT name FROM core_roles WHERE key = \'volunteer\'')).toEqual([{ name: 'Usher' }])
    expect(await rows('SELECT key FROM core_module_defaults WHERE kind = \'role\' AND key = \'front-of-house.volunteer\'')).toHaveLength(1)
  })

  it('offers nothing for a module that is off', async () => {
    await switchedOnBefore()
    await setModule('front-of-house', false)
    await runTask()
    expect(await presetRoles()).toEqual([])
    expect(await leadingShift()).toBe(0)
    expect(await rows('SELECT key FROM core_module_defaults WHERE module_id = \'front-of-house\'')).toEqual([])
  })
})
