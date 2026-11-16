// Roles, grants, re-assertion and the Owner (ID-22, ID-23, ID-28, ID-29), with the never-regress
// cases of the test plan named as they are there.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { routeDeclaration } from '#kit/route'
import { useRegistry } from '#kit/registry'
import { Authenticator } from './authenticator'
import { Browser, addPasskey, env, goStale, grantDirectly, leaveIdentity, reassert, reset, routes, setUpOwner, signInByEmail, staff, unclaimedAccount, useIdentity } from './helpers'
import { rows } from '../../../../../tests/integration/helpers'

let owner: { browser: Browser, device: Authenticator, accountId: string }
let ownerRoleId: string

beforeAll(async () => {
  useIdentity()
  const browser = new Browser()
  const device = new Authenticator()
  owner = { browser, device, accountId: await setUpOwner(browser, device) }
  ownerRoleId = (await rows<{ id: string }>('SELECT id FROM core_roles WHERE key = \'owner\''))[0]!.id
})
afterAll(leaveIdentity)
beforeEach(reset)

const role = (abilities: string[], extra: Record<string, unknown> = {}) => ({ name: `Role ${crypto.randomUUID().slice(0, 6)}`, abilities, expiryRule: 'none', opensMembersArea: true, ...extra })

async function makeRole(abilities: string[]): Promise<string> {
  const made = await owner.browser.post('/api/core/roles', role(abilities))
  expect(made.status).toBe(200)
  return made.body.id
}

describe('roles (ID-22)', () => {
  it('stores what an ability implies with it', async () => {
    const id = await makeRole(['core.grant.manage'])
    const listed = (await owner.browser.get('/api/core/roles')).body.roles.find((r: any) => r.id === id)
    expect(listed.abilities.sort()).toEqual(['core.account.search', 'core.grant.manage', 'core.grant.read'])
  })

  it('give only what you hold: a role cannot be given an ability its maker lacks', async () => {
    const maker = await staff()
    await grantDirectly(maker.accountId, ['core.role.manage'])
    const refused = await maker.browser.post('/api/core/roles', role(['core.account.disable']))
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('core.role.not-held')
    expect((await maker.browser.post('/api/core/roles', role(['core.role.read']))).status).toBe(200)
  })

  it('the Owner role cannot be edited or archived', async () => {
    expect((await owner.browser.put(`/api/core/roles/${ownerRoleId}`, role([]))).body.code).toBe('core.role.fixed')
    expect((await owner.browser.post(`/api/core/roles/${ownerRoleId}/archive`)).body.code).toBe('core.role.fixed')
  })

  it('archiving a role ends its grants', async () => {
    const roleId = await makeRole(['core.role.read'])
    const holder = await staff()
    await owner.browser.post('/api/core/grants', { accountId: holder.accountId, roleId })
    expect((await holder.browser.get('/api/core/roles')).status).toBe(200)
    expect((await owner.browser.post(`/api/core/roles/${roleId}/archive`)).status).toBe(200)
    expect((await holder.browser.get('/api/core/roles')).status).toBe(403)
  })
})

describe('grants (ID-23)', () => {
  it('a grant counts at once, and an ended grant stops counting on the next request', async () => {
    const roleId = await makeRole(['core.role.read'])
    const holder = await staff()
    expect((await holder.browser.get('/api/core/roles')).status).toBe(403)
    const given = await owner.browser.post('/api/core/grants', { accountId: holder.accountId, roleId })
    expect(given.status).toBe(200)
    expect((await holder.browser.get('/api/core/roles')).status).toBe(200)
    expect((await owner.browser.post(`/api/core/grants/${given.body.id}/end`)).status).toBe(200)
    expect((await holder.browser.get('/api/core/roles')).status).toBe(403)
    const history = (await owner.browser.get(`/api/core/grants?accountId=${holder.accountId}`)).body.grants
    expect(history.map((g: any) => g.state)).toEqual(['ended'])
  })

  it('changing a grant ends it and writes a new one; the history shows both', async () => {
    const roleId = await makeRole(['core.role.read'])
    const holder = await staff()
    const given = await owner.browser.post('/api/core/grants', { accountId: holder.accountId, roleId })
    const later = Date.now() + 86_400_000
    const changed = await owner.browser.put(`/api/core/grants/${given.body.id}`, { expiresAt: later })
    expect(changed.status).toBe(200)
    const history = (await owner.browser.get(`/api/core/grants?accountId=${holder.accountId}`)).body.grants
    expect(history.map((g: any) => [g.state, g.endedReason])).toEqual(expect.arrayContaining([['live', null], ['ended', 'replaced']]))
  })

  it('nobody grants themselves, through the route or straight into the database', async () => {
    const granter = await staff()
    const roleId = await makeRole(['core.role.read'])
    await grantDirectly(granter.accountId, ['core.grant.manage', 'core.role.read'])
    const self = await granter.browser.post('/api/core/grants', { accountId: granter.accountId, roleId })
    expect(self.status).toBe(403)
    expect(self.body.code).toBe('core.grant.self')
    await expect(env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES (\'gra_x\', ?, ?, \'site\', 0, ?, 0)').bind(granter.accountId, roleId, granter.accountId).run()).rejects.toThrow(/grants themselves/)
  })

  it('give only what you hold: a granter cannot give a role holding an ability they lack', async () => {
    const granter = await staff()
    await grantDirectly(granter.accountId, ['core.grant.manage'])
    const other = await staff()
    const roleId = await makeRole(['core.account.disable'])
    const refused = await granter.browser.post('/api/core/grants', { accountId: other.accountId, roleId })
    expect(refused.body.code).toBe('core.role.not-held')
  })

  it('one live grant of a role at a scope: a second is refused', async () => {
    const roleId = await makeRole(['core.role.read'])
    const holder = await staff()
    expect((await owner.browser.post('/api/core/grants', { accountId: holder.accountId, roleId })).status).toBe(200)
    expect((await owner.browser.post('/api/core/grants', { accountId: holder.accountId, roleId })).body.code).toBe('core.grant.already-held')
  })

  it('grant is never edited: the database refuses an update', async () => {
    const [grant] = await rows<{ id: string }>('SELECT id FROM core_grants LIMIT 1')
    await expect(env.DB.prepare('UPDATE core_grants SET expires_at = 1 WHERE id = ?').bind(grant!.id).run()).rejects.toThrow(/append-only/)
    await expect(env.DB.prepare('DELETE FROM core_grants WHERE id = ?').bind(grant!.id).run()).rejects.toThrow(/append-only/)
  })

  it('expired grant counts for nothing', async () => {
    const holder = await staff()
    const { grantId } = await grantDirectly(holder.accountId, ['core.role.read'])
    expect((await holder.browser.get('/api/core/roles')).status).toBe(200)
    // An expired grant, written as one that ended a moment ago: grants are append-only.
    await env.DB.prepare('INSERT INTO core_grant_ends (grant_id, ended_at, ended_reason) VALUES (?, ?, \'revoked\')').bind(grantId, Date.now()).run()
    expect((await holder.browser.get('/api/core/roles')).status).toBe(403)
    const later = await staff()
    const roleId = await makeRole(['core.role.read'])
    await env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, expires_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', 0, ?, \'acc_testgranter\', 0)').bind(`gra_${crypto.randomUUID().slice(0, 8)}`, later.accountId, roleId, Date.now() - 1).run()
    expect((await later.browser.get('/api/core/roles')).status).toBe(403)
  })

  it('pending grant counts for nothing: an unclaimed account shows as waiting and is never an actor', async () => {
    const roleId = await makeRole(['core.role.read'])
    const pending = await unclaimedAccount()
    expect((await owner.browser.post('/api/core/grants', { accountId: pending, roleId })).status).toBe(200)
    const [grant] = (await owner.browser.get(`/api/core/grants?accountId=${pending}`)).body.grants
    expect(grant.state).toBe('waiting-for-first-sign-in')
    expect(await rows('SELECT id FROM core_sessions WHERE account_id = ?', pending)).toEqual([])
  })

  it('scope does not leak: a grant on one record allows nothing on another or at site level', async () => {
    const roleId = await makeRole(['core.account.read'])
    const holder = await staff()
    const mine = await signInByEmail(new Browser())
    const theirs = await signInByEmail(new Browser())
    const given = await owner.browser.post('/api/core/grants', { accountId: holder.accountId, roleId, scope: { kind: 'record', module: 'core', type: 'core.account', id: mine } })
    expect(given.status).toBe(200)
    expect((await holder.browser.get(`/api/core/accounts/${mine}`)).status).toBe(200)
    expect((await holder.browser.get(`/api/core/accounts/${theirs}`)).status).toBe(403)
    expect((await holder.browser.get('/api/core/accounts?q=xx')).status).toBe(403)
  })
})

describe('the Owner (ID-29)', () => {
  it('only an Owner changes an Owner', async () => {
    const granter = await staff()
    await grantDirectly(granter.accountId, ['core.grant.manage', 'core.role.read'])
    const other = await staff()
    const refused = await granter.browser.post('/api/core/grants', { accountId: other.accountId, roleId: ownerRoleId })
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('core.owner.only-owner')
    const ownerGrant = (await rows<{ id: string }>('SELECT id FROM core_grants WHERE account_id = ? AND role_id = ?', owner.accountId, ownerRoleId))[0]!
    expect((await granter.browser.post(`/api/core/grants/${ownerGrant.id}/end`)).body.code).toBe('core.owner.only-owner')
  })

  it('last Owner survives: the only Owner cannot give up their last passkey', async () => {
    const [passkey] = (await owner.browser.get('/api/core/me/passkeys')).body.passkeys
    const refused = await owner.browser.delete(`/api/core/me/passkeys/${passkey.id}`)
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('core.owner.last')
  })

  it('last Owner survives two Owners ending each other at once', async () => {
    const second = await staff()
    const made = await owner.browser.post('/api/core/grants', { accountId: second.accountId, roleId: ownerRoleId })
    expect(made.status).toBe(200)
    const third = await staff()
    const madeThird = await owner.browser.post('/api/core/grants', { accountId: third.accountId, roleId: ownerRoleId })
    // Two non-original Owners end each other at the same moment while the first is disabled.
    await second.browser.post(`/api/core/accounts/${owner.accountId}/disable`, { reason: 'security' })
    const [a, b] = await Promise.all([
      second.browser.post(`/api/core/grants/${madeThird.body.id}/end`),
      third.browser.post(`/api/core/grants/${made.body.id}/end`),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect([a.body.code, b.body.code]).toContain('core.owner.last')
    // Put things back for the other tests: the survivor enables the first Owner.
    const survivor = a.status === 200 ? second : third
    expect((await survivor.browser.post(`/api/core/accounts/${owner.accountId}/enable`)).status).toBe(200)
    owner.browser = new Browser()
    const options = await owner.browser.post('/api/core/sign-in/passkey/options')
    await owner.browser.post('/api/core/sign-in/passkey', { challengeId: options.body.challengeId, response: await owner.device.get(options.body.options) })
  })
})

describe('sensitive actions ask again (ID-28)', () => {
  it('privileged ability refuses a basic session, on every privileged route', async () => {
    const basic = new Browser()
    const accountId = await signInByEmail(basic)
    await grantDirectly(accountId, [...useRegistry().abilities.keys()])
    const privileged = Object.entries(routes).filter(([, handler]) => {
      const ability = routeDeclaration(handler)?.ability
      return ability && ability !== 'signed-in' && useRegistry().abilities.get(ability)?.decl.risk === 'privileged'
    })
    expect(privileged.length).toBeGreaterThan(5)
    // A valid body for each route that takes one, so the walk reaches the permission check. A new
    // privileged route that takes input needs a line here, or this test fails for it.
    const id = 'acc_0000000000000000000000000a'
    const samples: Record<string, { query?: string, body?: unknown }> = {
      'POST /api/core/accounts/:id/disable': { body: { reason: 'security' } },
      'GET /api/core/accounts/merge': { query: `?winnerId=${id}&loserId=${id}` },
      'POST /api/core/accounts/merge': { body: { winnerId: id, loserId: id } },
      'POST /api/core/grants': { body: { accountId: id, roleId: id } },
      'PUT /api/core/modules/:id': { body: { on: true } },
      'POST /api/core/roles': { body: role([]) },
      'PUT /api/core/roles/:id': { body: role([]) },
    }
    for (const [route] of privileged) {
      const [method, path] = route.split(' ') as [string, string]
      const sample = samples[route] ?? {}
      const response = await basic.call(method, path.replace(/:[a-z]+/g, id) + (sample.query ?? ''), method === 'GET' ? undefined : (sample.body ?? {}))
      expect.soft(response.body?.code, route).toBe('core.access.needs-strong-sign-in')
    }
  })

  it('a strong session that is not fresh is asked to confirm, and after a passkey the same request goes through', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.role.manage'])
    await goStale(admin.accountId)
    const body = role(['core.role.read'])
    const refused = await admin.browser.post('/api/core/roles', body)
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe('core.access.not-fresh')
    expect((await reassert(admin.browser, admin.device)).status).toBe(200)
    expect((await admin.browser.post('/api/core/roles', body)).status).toBe(200)
  })

  it('a basic session cannot be upgraded by an emailed link', async () => {
    const browser = new Browser()
    const device = new Authenticator()
    const accountId = await signInByEmail(browser)
    await addPasskey(browser, device)
    await env.DB.prepare('UPDATE core_sessions SET assurance = \'basic\' WHERE account_id = ?').bind(accountId).run()
    await signInByEmail(browser, (await browser.get('/api/core/me')).body.addresses[0].address)
    expect((await browser.get('/api/core/me')).body.session.assurance).toBe('basic')
  })
})

describe('every route declares its guard', () => {
  it('every core route is a defineRoute with an ability or public: true', () => {
    for (const [route, handler] of Object.entries(routes)) {
      const decl = routeDeclaration(handler)
      expect(decl, route).toBeTruthy()
      expect(!!decl!.ability !== !!decl!.public, route).toBe(true)
    }
  })
})
