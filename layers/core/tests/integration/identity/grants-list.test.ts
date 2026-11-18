// Who holds what (Identity Doc part 5): grants by state, role and reach, searched by the holder.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { env, grantDirectly, leaveIdentity, reset, staff, useIdentity } from './helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
beforeEach(reset)

const DAY = 86_400_000

async function holder(name: string, claimed = true): Promise<string> {
  const id = newId('acc')
  await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?)').bind(id, name, Date.now(), claimed ? Date.now() : null).run()
  return id
}
async function give(accountId: string, roleId: string, extra: { startsIn?: number, endsIn?: number | null, ended?: boolean } = {}): Promise<string> {
  const id = newId('gra')
  const now = Date.now()
  await env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, expires_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', ?, ?, \'acc_testgranter\', ?)')
    .bind(id, accountId, roleId, now + (extra.startsIn ?? -DAY), extra.endsIn === undefined || extra.endsIn === null ? null : now + extra.endsIn, now - DAY).run()
  if (extra.ended) await env.DB.prepare('INSERT INTO core_grant_ends (grant_id, ended_at, ended_reason) VALUES (?, ?, \'revoked\')').bind(id, now).run()
  return id
}

describe('Who holds what', () => {
  it('shows current grants by state, keeps ended ones a view away, and finds by the holder', async () => {
    const { browser, accountId } = await staff()
    const { roleId } = await grantDirectly(accountId, ['core.grant.read'])
    const word = `Quillon${crypto.randomUUID().slice(0, 6)}`
    const ada = await holder(`Ada ${word}`)
    const una = await holder(`Una ${word}`, false)
    const live = await give(ada, roleId)
    const lapsing = await give(ada, roleId, { endsIn: 2 * DAY })
    const pending = await give(una, roleId)
    const ended = await give(ada, roleId, { ended: true })

    const current = await browser.get(`/api/core/grants/held?q=${word}`)
    expect(current.status).toBe(200)
    const byId = Object.fromEntries(current.body.rows.map((r: any) => [r.id, r.state]))
    expect(byId).toEqual({ [live]: 'live', [lapsing]: 'lapsing', [pending]: 'pending' })
    expect(current.body.rows.find((r: any) => r.id === live)).toMatchObject({ accountId: ada, person: `Ada ${word}`, scope: { kind: 'site' } })

    const soon = await browser.get(`/api/core/grants/held?q=${word}&view=lapsing`)
    expect(soon.body.rows.map((r: any) => r.id)).toEqual([lapsing])
    const gone = await browser.get(`/api/core/grants/held?q=${word}&view=ended`)
    expect(gone.body.rows.map((r: any) => r.id)).toEqual([ended])
    const ofRole = await browser.get(`/api/core/grants/held?q=${word}&role=${roleId}&state=live`)
    expect(ofRole.body.rows.map((r: any) => r.id)).toEqual([live])
  })

  it('offers its role options, says whether the viewer manages grants, and refuses without core.grant.read', async () => {
    const { browser, accountId } = await staff()
    expect((await browser.get('/api/core/grants/held')).status).toBe(403)
    await grantDirectly(accountId, ['core.grant.read'])
    const options = await browser.get('/api/core/grants/options')
    expect(options.body).toMatchObject({ manage: false, modules: expect.arrayContaining(['core']) })
    expect(options.body.roles.length).toBeGreaterThan(0)
    // What giving a role needs: when each role's grants end, and where it can be given.
    expect(options.body).toHaveProperty('yearEnd')
    expect(typeof options.body.allowNoExpiry).toBe('boolean')
    expect(options.body.roles[0]).toMatchObject({ owner: expect.any(Boolean), expiryRule: expect.any(String), modules: expect.any(Array) })
  })
})
