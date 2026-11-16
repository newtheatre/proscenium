// Roles that expire (ID-24): the year end read from core.organisation.year-end, renewal, and who
// holds what now (holdersOf, holdersOfRole).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Authenticator } from './authenticator'
import { Browser, clearSetting, env, grantDirectly, leaveIdentity, reset, setSetting, setUpOwner, signInByEmail, staff, unclaimedAccount, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { yearEndAfter } from '../../../server/identity/year-end'
import { holdersOf, holdersOfRole } from '../../../server/identity/holders'

let owner: { browser: Browser, device: Authenticator, accountId: string }
const ZONE = 'Europe/London'

beforeAll(async () => {
  useIdentity()
  const browser = new Browser()
  const device = new Authenticator()
  owner = { browser, device, accountId: await setUpOwner(browser, device) }
})
afterAll(leaveIdentity)
beforeEach(async () => {
  reset()
  await setSetting('core.locale.time-zone', ZONE)
  await clearSetting('core.organisation.year-end')
})

const role = (extra: Record<string, unknown>) => ({ name: `Role ${crypto.randomUUID().slice(0, 6)}`, abilities: ['core.role.read'], opensMembersArea: true, ...extra })

describe('the year end (ID-24)', () => {
  it('is the first moment after the year-end day, in the theatre\'s time zone, strictly after today', () => {
    // 31 July in summer time: the end is midnight local, 23:00 UTC.
    expect(new Date(yearEndAfter('2026-11-16', '07-31', ZONE)).toISOString()).toBe('2027-07-31T23:00:00.000Z')
    expect(new Date(yearEndAfter('2026-07-30', '07-31', ZONE)).toISOString()).toBe('2026-07-31T23:00:00.000Z')
    expect(new Date(yearEndAfter('2026-07-31', '07-31', ZONE)).toISOString()).toBe('2027-07-31T23:00:00.000Z')
    expect(new Date(yearEndAfter('2026-11-16', '12-31', ZONE)).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it('cannot be chosen for a role while the theatre has not set it', async () => {
    const refused = await owner.browser.post('/api/core/roles', role({ expiryRule: 'year_end' }))
    expect(refused.body.code).toBe('core.role.year-end-unset')
    await setSetting('core.organisation.year-end', '07-31')
    expect((await owner.browser.post('/api/core/roles', role({ expiryRule: 'year_end' }))).status).toBe(200)
  })

  it('gives a new grant the next year end', async () => {
    await setSetting('core.organisation.year-end', '07-31')
    const made = await owner.browser.post('/api/core/roles', role({ expiryRule: 'year_end' }))
    const holder = await signInByEmail(new Browser())
    const given = await owner.browser.post('/api/core/grants', { accountId: holder, roleId: made.body.id })
    expect(given.status).toBe(200)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    expect(await rows('SELECT expires_at FROM core_grants WHERE id = ?', given.body.id)).toEqual([{ expires_at: yearEndAfter(today, '07-31', ZONE) }])
  })

  it('a year-end role made before the year end was cleared needs an end date given', async () => {
    await setSetting('core.organisation.year-end', '07-31')
    const made = await owner.browser.post('/api/core/roles', role({ expiryRule: 'year_end' }))
    await clearSetting('core.organisation.year-end')
    const holder = await signInByEmail(new Browser())
    const refused = await owner.browser.post('/api/core/grants', { accountId: holder, roleId: made.body.id })
    expect(refused.body.code).toBe('core.grant.year-end-unset')
    expect((await owner.browser.post('/api/core/grants', { accountId: holder, roleId: made.body.id, expiresAt: Date.now() + 86_400_000 })).status).toBe(200)
  })

  it('a new role cannot default to the year end until the year end is set', async () => {
    const admin = await staff()
    await grantDirectly(admin.accountId, ['core.identity-settings.manage'])
    const choose = () => admin.browser.put('/api/core/settings/core.grants.default-expiry', { value: 'year-end' })
    expect((await choose()).body.fields).toEqual({ value: 'core.settings.rules.default-expiry-needs-year-end' })
    await setSetting('core.organisation.year-end', '07-31')
    expect((await choose()).status).toBe(200)
    await clearSetting('core.grants.default-expiry')
  })
})

describe('renewal (ID-24)', () => {
  it('renews a list in one action; each renewal is a new grant with a new end from the role\'s rule', async () => {
    const made = await owner.browser.post('/api/core/roles', role({ expiryRule: 'days', expiryDays: 30 }))
    const live = await signInByEmail(new Browser())
    const lapsed = await signInByEmail(new Browser())
    const first = (await owner.browser.post('/api/core/grants', { accountId: live, roleId: made.body.id })).body.id
    // Grants are append-only, so the lapsed one is written as it would stand once its end has passed.
    const second = `gra_lapsed${crypto.randomUUID().slice(0, 8)}`
    await env.DB.prepare('INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, expires_at, granted_by, granted_at) VALUES (?, ?, ?, \'site\', ?, ?, ?, ?)')
      .bind(second, lapsed, made.body.id, Date.now() - 86_400_000, Date.now() - 1000, owner.accountId, Date.now() - 86_400_000).run()

    const renewed = await owner.browser.post('/api/core/grants/renew', { grantIds: [first, second] })
    expect(renewed.status).toBe(200)
    const pairs = renewed.body.renewed as Array<{ from: string, to: string }>
    expect(pairs.map(p => p.from)).toEqual([first, second])
    expect(pairs.every(p => p.to !== p.from)).toBe(true)
    expect(await rows('SELECT ended_reason FROM core_grant_ends WHERE grant_id = ?', first)).toEqual([{ ended_reason: 'replaced' }])
    const states = (await owner.browser.get(`/api/core/grants?roleId=${made.body.id}`)).body.grants
    expect(states.filter((g: any) => g.state === 'live').map((g: any) => g.id).sort()).toEqual(pairs.map(p => p.to).sort())
    for (const p of pairs) {
      const [g] = await rows<{ expires_at: number }>('SELECT expires_at FROM core_grants WHERE id = ?', p.to)
      expect(Math.abs(g!.expires_at - (Date.now() + 30 * 86_400_000))).toBeLessThan(60_000)
    }
  })

  it('renewing still needs what the role brings', async () => {
    const granter = await staff()
    await grantDirectly(granter.accountId, ['core.grant.manage'])
    const made = await owner.browser.post('/api/core/roles', role({ expiryRule: 'none' }))
    const holder = await signInByEmail(new Browser())
    const given = (await owner.browser.post('/api/core/grants', { accountId: holder, roleId: made.body.id })).body.id
    expect((await granter.browser.post('/api/core/grants/renew', { grantIds: [given] })).body.code).toBe('core.role.not-held')
  })
})

describe('who holds what now', () => {
  it('holdersOf counts roles, leaves out the unclaimed and the disabled, and follows the Owner\'s exceptions', async () => {
    const holder = await signInByEmail(new Browser())
    const disabled = await signInByEmail(new Browser())
    const waiting = await unclaimedAccount()
    const { roleId } = await grantDirectly(holder, ['core.role.read'])
    await grantDirectly(disabled, [], { roleId })
    await grantDirectly(waiting, [], { roleId })
    await env.DB.prepare('UPDATE core_accounts SET disabled_at = ?, disabled_reason = \'security\' WHERE id = ?').bind(Date.now(), disabled).run()

    const readers = await inContext(() => holdersOf('core.role.read'))
    expect(readers).toContain(holder)
    expect(readers).toContain(owner.accountId)
    expect(readers).not.toContain(disabled)
    expect(readers).not.toContain(waiting)
    // role.manage implies role.read: its holders read roles too.
    const manager = await signInByEmail(new Browser())
    await grantDirectly(manager, ['core.role.manage'])
    expect(await inContext(() => holdersOf('core.role.read'))).toContain(manager)

    const contactReaders = await inContext(() => holdersOf('core.emergency-contact.read'))
    expect(contactReaders).not.toContain(owner.accountId)

    expect(await inContext(() => holdersOfRole(roleId))).toEqual([holder])
    expect(await inContext(() => holdersOfRole(roleId, { kind: 'module', module: 'core' }))).toEqual([])
  })

  it('holdersOf counts an owner the ability grants to, for that record only', async () => {
    const person = await signInByEmail(new Browser())
    const readers = await inContext(() => holdersOf('core.account.read', ['core.account', person]))
    expect(readers).toContain(person)
    expect(await inContext(() => holdersOf('core.account.read'))).not.toContain(person)
  })
})
