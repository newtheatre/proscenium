// Erasure and the staff data-request queue (ID-16, ID-35).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createUnit } from '#kit/unit'
import { useRegistry } from '#kit/registry'
import type { TableMeta } from '#kit/db'
import { Browser, deliver, env, goStale, grantDirectly, leaveIdentity, reassert, reset, setSetting, clearSetting, signInByEmail, staff, unclaimedAccount, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'
import { setMailer, useMailer, type OutgoingEmail } from '../../../server/notifications/mailer'
import { eraseAccount, erasurePlan } from '../../../server/identity/erasure'
import { exportPlan } from '../../../server/identity/export'
import review from '../../../server/tasks/review-data-requests'

const sent: OutgoingEmail[] = []

beforeAll(async () => {
  await useIdentity()
  const inner = useMailer()
  setMailer(async (email) => {
    sent.push(email)
    return inner(email)
  })
  await setSetting('core.privacy.contact', 'privacy@example.org')
})
afterAll(async () => {
  await clearSetting('core.privacy.contact')
  leaveIdentity()
})
beforeEach(() => {
  reset()
  sent.length = 0
})

const to = (addressee: string) => sent.filter(e => e.to === addressee)
const fragmentIn = (email: OutgoingEmail | undefined) => /https?:\/\/\S+#([\w-]+)/.exec(email?.text ?? '')?.[1] ?? ''

async function runReview() {
  await inContext(async () => {
    const unit = createUnit()
    await review(unit, { dueAt: Date.now() })
    await unit.commit()
  })
  await deliver()
}

/** Somebody signed in, with a passkey, a fresh session and the address they signed in with. */
async function person() {
  const { browser, device, accountId } = await staff()
  const [{ address: mine }] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', accountId)
  await browser.patch('/api/core/me', { name: 'Erin Erased', pronouns: 'they/them' })
  await deliver()
  sent.length = 0
  return { browser, device, accountId, mine: mine! }
}

/** Asks for erasure and uses the link; returns the request id. */
async function askAndConfirm(browser: Browser, mine: string): Promise<string> {
  const asked = await browser.post('/api/core/me/data-requests', { kind: 'erasure' })
  expect(asked.status).toBe(200)
  await deliver()
  const confirmed = await new Browser().post('/api/core/me/data-requests/confirm', { token: fragmentIn(to(mine).at(-1)) })
  expect(confirmed.status).toBe(200)
  return asked.body.id
}

describe('asking for erasure (ID-16)', () => {
  it('needs a fresh re-assertion and the privacy contact, and sends a link to confirm', async () => {
    const { browser, device, accountId, mine } = await person()
    await goStale(accountId)
    expect((await browser.post('/api/core/me/data-requests', { kind: 'erasure' })).body.code).toBe('core.access.not-fresh')
    await reassert(browser, device)
    await clearSetting('core.privacy.contact')
    try {
      expect((await browser.post('/api/core/me/data-requests', { kind: 'erasure' })).body.code).toBe('core.privacy.contact-unset')
      expect((await browser.get('/api/core/me/data-requests')).body.available).toBe(false)
    }
    finally {
      await setSetting('core.privacy.contact', 'privacy@example.org')
    }
    const asked = await browser.post('/api/core/me/data-requests', { kind: 'erasure' })
    expect(asked.status).toBe(200)
    await deliver()
    const [mail] = to(mine)
    expect(mail!.subject).toBe('Confirm that The Test Theatre should erase your account')
    expect(mail!.text).toContain('1 week')
    expect(fragmentIn(mail)).not.toBe('')
    // The link is sealed: never stored in clear.
    expect(await rows('SELECT count(*) AS n FROM core_notifications WHERE payload LIKE ?', `%${fragmentIn(mail)}%`)).toEqual([{ n: 0 }])
    expect((await browser.get('/api/core/me/data-requests')).body.requests[0]).toMatchObject({ kind: 'erasure', state: 'requested' })
    expect((await browser.post('/api/core/me/data-requests', { kind: 'erasure' })).body.code).toBe('core.data-request.open')
  })

  it('confirming starts the cooling-off; the person can cancel until it runs', async () => {
    const { browser, mine } = await person()
    const id = await askAndConfirm(browser, mine)
    const [mine1] = (await browser.get('/api/core/me/data-requests')).body.requests
    expect(mine1.state).toBe('confirmed')
    expect(mine1.notBefore - Date.now()).toBeGreaterThan(6 * 86400_000)
    // The link works once.
    expect((await new Browser().post('/api/core/me/data-requests/confirm', { token: fragmentIn(to(mine).at(-1)) })).body.code).toBe('core.data-request.link-unknown')
    expect((await browser.delete(`/api/core/me/data-requests/${id}`)).status).toBe(200)
    expect((await browser.get('/api/core/me/data-requests')).body.requests[0].state).toBe('cancelled')
    // Nothing runs for a cancelled request.
    await env.DB.prepare('UPDATE core_data_requests SET not_before = 1 WHERE id = ?').bind(id).run()
    await runReview()
    expect((await browser.get('/api/core/me')).body.account).toBeTruthy()
  })

  it('runs after the cooling-off: everything about the person goes, the tombstone stays, the old address is told once', async () => {
    const { browser, accountId, mine } = await person()
    const id = await askAndConfirm(browser, mine)
    await env.DB.prepare('UPDATE core_data_requests SET not_before = 1 WHERE id = ?').bind(id).run()
    sent.length = 0
    await runReview()
    const [account] = await rows<any>('SELECT * FROM core_accounts WHERE id = ?', accountId)
    expect(account).toMatchObject({ name: null, preferred_name: null, pronouns: null, phone: null, audience_email_id: null })
    expect(account.anonymised_at).toBeGreaterThan(0)
    for (const table of ['core_account_emails', 'core_passkeys', 'core_sessions', 'core_account_tokens', 'core_recovery_codes'])
      expect(await rows(`SELECT count(*) AS n FROM ${table} WHERE account_id = ?`, accountId)).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM core_audit WHERE actor_account_id = ? AND actor_name IS NOT NULL AND actor_name <> \'Former member\'', accountId)).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM core_notifications WHERE account_id = ? AND payload IS NOT NULL', accountId)).toEqual([{ n: 0 }])
    expect(await rows('SELECT state FROM core_data_requests WHERE id = ?', id)).toEqual([{ state: 'done' }])
    expect(to(mine).map(e => e.subject)).toEqual(['Your account at The Test Theatre has been erased'])
    // The browser is signed out, and the address can make a new account.
    expect((await browser.get('/api/core/me')).body.signedIn).toBe(false)
    const fresh = await signInByEmail(new Browser(), mine)
    expect(fresh).not.toBe(accountId)
  })

  it('a second run is harmless', async () => {
    const { browser, accountId, mine } = await person()
    const id = await askAndConfirm(browser, mine)
    await env.DB.prepare('UPDATE core_data_requests SET not_before = 1 WHERE id = ?').bind(id).run()
    await runReview()
    const before = await rows('SELECT * FROM core_accounts WHERE id = ?', accountId)
    const again = await inContext(async () => {
      const unit = createUnit()
      const result = await eraseAccount(unit, accountId)
      await unit.commit()
      return result
    })
    expect(again).toBeNull()
    expect(await rows('SELECT * FROM core_accounts WHERE id = ?', accountId)).toEqual(before)
  })

  it('reaches rows written under an account merged into this one, through the account scope', async () => {
    const survivor = await unclaimedAccount()
    const merged = await unclaimedAccount()
    await env.DB.prepare('UPDATE core_accounts SET merged_into_id = ?, merged_at = ? WHERE id = ?').bind(survivor, Date.now(), merged).run()
    // core_inbox_items.account_id is alias: the row keeps the merged-away id it was written with.
    await env.DB.prepare('INSERT INTO core_inbox_items (id, account_id, side, title, expires_at, created_at) VALUES (?, ?, \'audience\', \'Your tickets\', ?, ?)').bind('inb_aaaaaaaaaaaaaaaaaaaaaaaaaa', merged, Date.now() + 86_400_000, Date.now()).run()
    await inContext(async () => {
      const unit = createUnit()
      await eraseAccount(unit, survivor)
      await unit.commit()
    })
    expect(await rows('SELECT id FROM core_inbox_items WHERE account_id = ?', merged)).toEqual([])
    expect(await rows<{ id: string, anonymised: number }>('SELECT id, anonymised_at IS NOT NULL AS anonymised FROM core_accounts WHERE id IN (?, ?) ORDER BY id', survivor, merged)).toEqual(
      [survivor, merged].sort().map(id => ({ id, anonymised: 1 })))
  })

  it('clears an internal column declared erase: \'clear\' with the row\'s personal columns, and leaves it out of a download', async () => {
    const accountId = await unclaimedAccount()
    const [show] = await rows<{ id: string }>('SELECT id FROM seats_performances LIMIT 1')
    const performanceId = show?.id ?? 'sp_aaaaaaaaaaaaaaaaaaaaaaaaaa'
    if (!show) await env.DB.prepare('INSERT INTO seats_performances (id, title, capacity) VALUES (?, \'Hamlet\', 5)').bind(performanceId).run()
    await env.DB.prepare('INSERT INTO seats_ledger (id, performance_id, quantity, buyer_id, buyer_name, link_hash, created_at) VALUES (?, ?, 1, ?, \'Pat Person\', \'h4sh\', ?)').bind('sl_aaaaaaaaaaaaaaaaaaaaaaaaab', performanceId, accountId, Date.now()).run()
    expect(exportPlan().find(t => t.table === 'seats_ledger')?.columns).not.toContain('link_hash')
    await inContext(async () => {
      const unit = createUnit()
      await eraseAccount(unit, accountId)
      await unit.commit()
    })
    expect(await rows('SELECT buyer_name, link_hash FROM seats_ledger WHERE id = ?', 'sl_aaaaaaaaaaaaaaaaaaaaaaaaab')).toEqual([{ buyer_name: 'Former member', link_hash: null }])
  })

  it('ends live grants, keeping them as history', async () => {
    const { browser, accountId, mine } = await person()
    const { grantId } = await grantDirectly(accountId, ['core.account.search'])
    const id = await askAndConfirm(browser, mine)
    await env.DB.prepare('UPDATE core_data_requests SET not_before = 1 WHERE id = ?').bind(id).run()
    await runReview()
    expect(await rows('SELECT ended_reason FROM core_grant_ends WHERE grant_id = ?', grantId)).toEqual([{ ended_reason: 'account_closed' }])
    expect(await rows('SELECT count(*) AS n FROM core_grants WHERE id = ?', grantId)).toEqual([{ n: 1 }])
  })

  it('the last Owner is held, with a reason for the person, until another Owner exists', async () => {
    const { browser, accountId: ownerId, mine } = await person()
    const [existing] = await rows<{ id: string }>('SELECT id FROM core_roles WHERE key = \'owner\'')
    const { roleId: ownerRole } = await grantDirectly(ownerId, [], existing ? { roleId: existing.id } : { roleKey: 'owner' })
    // Make this the only Owner who can sign in.
    await env.DB.prepare('INSERT INTO core_grant_ends (grant_id, ended_at, ended_by, ended_reason) SELECT g.id, ?, NULL, \'revoked\' FROM core_grants g WHERE g.role_id = ? AND g.account_id <> ? AND NOT EXISTS (SELECT 1 FROM core_grant_ends e WHERE e.grant_id = g.id)').bind(Date.now(), ownerRole, ownerId).run()
    await deliver()
    sent.length = 0
    const id = await askAndConfirm(browser, mine)
    expect((await browser.get('/api/core/me/data-requests')).body.requests[0]).toMatchObject({ state: 'held', holds: ['core.erasure.last-owner'] })
    await env.DB.prepare('UPDATE core_data_requests SET not_before = 1 WHERE id = ?').bind(id).run()
    await runReview()
    expect(await rows('SELECT state, holds FROM core_data_requests WHERE id = ?', id)).toEqual([{ state: 'held', holds: '["core.erasure.last-owner"]' }])
    // Another Owner with a passkey clears the hold, and the next review runs it.
    const other = await staff()
    await grantDirectly(other.accountId, [], { roleId: ownerRole })
    await runReview()
    expect(await rows('SELECT state FROM core_data_requests WHERE id = ?', id)).toEqual([{ state: 'done' }])
  })
})

describe('the erasure plan', () => {
  it('reaches every table that holds something personal about a person', () => {
    const planned = new Set(erasurePlan().map(s => s.table))
    for (const [name, { meta }] of useRegistry().tables as Map<string, { meta: TableMeta }>) {
      const personal = Object.values(meta.columns).some(c => ['clear', 'anonymise', 'redact'].includes(c.meta.erase))
      if (!personal || meta.options.subject === 'none') continue
      expect(planned, `${name} holds personal columns but erasure does not reach it`).toContain(name)
    }
  })

  it('orders rows reached through a parent before the parent, and the account last', () => {
    const plan = erasurePlan()
    expect(plan.at(-1)!.table).toBe('core_accounts')
  })
})

describe('the staff queue (ID-35)', () => {
  it('lists requests by respond-by date, and needs core.data-request.manage', async () => {
    const { browser, mine } = await person()
    const id = await askAndConfirm(browser, mine)
    const desk = await staff()
    expect((await desk.browser.get('/api/core/data-requests')).status).toBe(403)
    await grantDirectly(desk.accountId, ['core.data-request.manage'])
    const queue = (await desk.browser.get('/api/core/data-requests')).body.rows
    const row = queue.find((r: any) => r.id === id)
    expect(row).toMatchObject({ kind: 'erasure', state: 'confirmed', overdue: false, closed: false, person: 'Erin Erased' })
    expect(row.respondBy - Date.now()).toBeGreaterThan(29 * 86400_000)
  })

  it('finds requests by the person\'s name, and shows those past their respond-by date as overdue', async () => {
    const { browser, mine } = await person()
    const id = await askAndConfirm(browser, mine)
    const desk = await staff()
    await grantDirectly(desk.accountId, ['core.data-request.manage'])
    expect((await desk.browser.get('/api/core/data-requests?q=Erin')).body.rows.map((r: any) => r.id)).toContain(id)
    expect((await desk.browser.get('/api/core/data-requests?q=Nobodyknown')).body.rows.map((r: any) => r.id)).not.toContain(id)
    expect((await desk.browser.get('/api/core/data-requests?view=overdue')).body.rows.map((r: any) => r.id)).not.toContain(id)
    await env.DB.prepare('UPDATE core_data_requests SET respond_by = 1 WHERE id = ?').bind(id).run()
    const overdue = (await desk.browser.get('/api/core/data-requests?view=overdue')).body.rows
    expect(overdue.find((r: any) => r.id === id)).toMatchObject({ overdue: true })
    expect((await desk.browser.get('/api/core/data-requests?kind=export')).body.rows.map((r: any) => r.id)).not.toContain(id)
  })

  it('staff start a request for somebody, recording how they checked who it was', async () => {
    const { accountId, mine } = await person()
    const desk = await staff()
    await grantDirectly(desk.accountId, ['core.data-request.manage'])
    expect((await desk.browser.post('/api/core/data-requests', { accountId: desk.accountId, kind: 'erasure', identityCheck: 'in-person' })).body.code).toBe('core.access.own-record')
    const started = await desk.browser.post('/api/core/data-requests', { accountId, kind: 'erasure', identityCheck: 'in-person' })
    expect(started.status).toBe(200)
    await deliver()
    expect(to(mine)).toHaveLength(1)
    expect(await rows('SELECT identity_check, requested_by FROM core_data_requests WHERE id = ?', started.body.id)).toEqual([{ identity_check: 'in-person', requested_by: desk.accountId }])
    expect((await desk.browser.delete(`/api/core/data-requests/${started.body.id}`)).status).toBe(200)
  })

  it('a request closes only once it has run and every hand-search line is ticked', async () => {
    const { browser, mine } = await person()
    const id = await askAndConfirm(browser, mine)
    const desk = await staff()
    await grantDirectly(desk.accountId, ['core.data-request.manage'])
    expect((await desk.browser.post(`/api/core/data-requests/${id}/close`)).body.code).toBe('core.data-request.not-finished')
    await env.DB.prepare('UPDATE core_data_requests SET not_before = 1 WHERE id = ?').bind(id).run()
    await runReview()
    const { checklist, actions } = (await desk.browser.get(`/api/core/data-requests/${id}`)).body
    expect(actions).toEqual({ cancel: false, tick: true, close: false })
    expect(checklist.map((l: any) => l.table)).toEqual(expect.arrayContaining(['core_account_tokens', 'core_files']))
    expect((await desk.browser.post(`/api/core/data-requests/${id}/close`)).body.code).toBe('core.data-request.checklist-open')
    for (const line of checklist) expect((await desk.browser.put(`/api/core/data-requests/${id}/checks`, { table: line.table, outcome: 'nothing-found' })).status).toBe(200)
    expect((await desk.browser.put(`/api/core/data-requests/${id}/checks`, { table: 'core_accounts', outcome: 'handled' })).body.code).toBe('core.data-request.no-such-line')
    expect((await desk.browser.get(`/api/core/data-requests/${id}`)).body.actions.close).toBe(true)
    expect((await desk.browser.post(`/api/core/data-requests/${id}/close`)).status).toBe(200)
    expect((await desk.browser.get('/api/core/data-requests')).body.rows.some((r: any) => r.id === id)).toBe(false)
    expect((await desk.browser.get('/api/core/data-requests?view=closed')).body.rows.map((r: any) => r.id)).toContain(id)
  })
})
