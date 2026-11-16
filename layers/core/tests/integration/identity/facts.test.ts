// Mapping abilities to facts (ID-22; identity spec part 6, Facts): edited like a role, nobody maps
// what they do not hold, and a privileged ability counts only once the theatre confirms it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { grantDirectly, leaveIdentity, reset, staff, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
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
