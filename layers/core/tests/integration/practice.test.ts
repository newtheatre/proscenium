// Practice mode (PM-02 to PM-09, PM-14, PM-15, PM-17, PM-19): a marked request runs in the person's
// own store and nothing it does reaches the real database, a queue, the mailer or an outside service.
// Cases T-PM-01 to T-PM-05, T-PM-09 to T-PM-12, T-PM-17 to T-PM-19, T-PM-21 to T-PM-23.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, externalCall, type Actor } from '#kit'
import { runInContext, SYSTEM } from '#kit/context'
import { guardOutsideCalls, setPracticeGate } from '#kit/practice/gate'
import { cachePrefix, filesPrefix, practiceEnv, practiceStore } from '#kit/practice/env'
import { storeDatabase } from '#kit/practice/database'
import { newId } from '#kit/ids'
import { practiceGate } from '../../server/practice/gate'
import { readSession } from '../../server/practice/session'
import { eraseAccount } from '../../server/identity/erasure'
import { PRACTICE_NOT_SENT, setMailer, useMailer } from '../../server/notifications/mailer'
import list from '../../server/api/core/practice/index.get'
import start from '../../server/api/core/practice/start.post'
import leave from '../../server/api/core/practice/leave.post'
import session from '../../server/api/core/practice/session.get'
import answer from '../../server/api/core/practice/calls/[id].post'
import reassert from '../../server/api/core/me/reassert.post'
import pretend from '../../server/api/core/practice/reassert.post'
import sell from '../../../../tests/fixtures/modules/seats/server/api/seats/[id]/sell.post'
import { call, env, inContext, performance, person, rows, sent, server } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/practice': list,
  'POST /api/core/practice/start': start,
  'POST /api/core/practice/leave': leave,
  'GET /api/core/practice/session': session,
  'POST /api/core/practice/calls/:id': answer,
  'POST /api/core/practice/reassert': pretend,
  'POST /api/core/me/reassert': reassert,
  'POST /api/seats/:id/sell': sell,
})
const MARK = { 'proscenium-practice': '1', 'referer': 'http://test/practice/live/door' }

const admin = (): Actor => person(['core.practice.manage'])
const marked = (actor: Actor, method: string, path: string, body?: unknown) => call(handle, method, path, { actor, body, headers: { ...MARK, 'idempotency-key': newId('req') } })
const storeOf = (accountId: string) => storeDatabase(practiceStore(env, accountId))
const inStore = <T>(accountId: string, fn: () => Promise<T>) =>
  runInContext({ env: practiceEnv(env, accountId, Date.now() + 3_600_000), practice: { accountId, scenarioId: 'seats.door', abilities: ['seats.orders.sell'], endsBy: Date.now() + 3_600_000 }, actor: SYSTEM, cache: {} }, fn)

/** Every real table's row count and contents, to show a practice run left them as they were. */
async function fingerprint(): Promise<Record<string, string>> {
  const tables = await rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '%_fts%' AND name NOT IN ('core_rate_limits')")
  const out: Record<string, string> = {}
  for (const { name } of tables) out[name] = JSON.stringify(await rows(`SELECT * FROM "${name}"`))
  return out
}

async function begin(actor: Actor, scenario = 'seats.door', extra: Record<string, unknown> = {}) {
  const response = await call(handle, 'POST', '/api/core/practice/start', { actor, body: { scenario, ...extra }, headers: MARK })
  return { status: response.status, body: await response.json() as any }
}

beforeAll(async () => {
  setPracticeGate(practiceGate)
  guardOutsideCalls()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { confirm: true })
    await unit.commit()
  })
})
afterAll(() => setPracticeGate(undefined))
beforeEach(() => {
  sent.length = 0
})

describe('starting practice (PM-08, S1 to S4, S8)', () => {
  it('makes a store with the theatre\'s setup copied and the sample sets run, and opens the scenario\'s live page', async () => {
    const real = await performance(20)
    const me = admin()
    const before = await fingerprint()
    const { status, body } = await begin(me)
    expect(status).toBe(200)
    expect(body.to).toMatch(/^\/practice\/live\/door\/sp_/)
    const store = storeOf(me.accountId!)
    // Copied: the theatre's own performances (practice: 'copy'); never its ledger or audit.
    expect(await store.prepare('SELECT capacity FROM seats_performances WHERE id = ?').bind(real).first('capacity')).toBe(20)
    expect(await store.prepare('SELECT count(*) AS n FROM core_audit').first('n')).toBe(0)
    const session = await readSessionAs(me.accountId!)
    expect(session).toMatchObject({ scenario_id: 'seats.door', scenario_version: 1 })
    expect(await fingerprint()).toEqual(before)
  })

  it('carries on the same store when started again, and asks before replacing another scenario\'s (S2, S8, T-PM-10)', async () => {
    const me = admin()
    const first = await begin(me)
    const again = await begin(me)
    expect(again.body.startedAt).toBe(first.body.startedAt)
    const other = await begin(me, 'seats.desk')
    expect(other.status).toBe(409)
    expect(other.body.code).toBe('core.practice.other-active')
    const replaced = await begin(me, 'seats.desk', { replace: true })
    expect(replaced.status).toBe(200)
    expect((await readSessionAs(me.accountId!))?.scenario_id).toBe('seats.desk')
  })

  it('starts again from nothing when asked (S4)', async () => {
    const me = admin()
    const first = await begin(me)
    await marked(me, 'POST', `/api/seats/${first.body.to.split('/').pop()}/sell`, { quantity: 1 })
    const again = await begin(me, 'seats.door', { again: true })
    const show = again.body.to.split('/').pop()
    expect(await storeOf(me.accountId!).prepare('SELECT sold FROM seats_performances WHERE id = ?').bind(show).first('sold')).toBe(3)
  })

  it('opens only to someone a training course opens it to, or an administrator (T-PM-03, T-PM-27)', async () => {
    const learner = person([])
    expect((await begin(learner)).body.code).toBe('core.practice.not-allowed')
    expect((await call(handle, 'GET', '/api/core/practice', { actor: learner }).then(r => r.json()) as any).scenarios).toEqual([])
    const listed = await call(handle, 'GET', '/api/core/practice', { actor: admin() }).then(r => r.json()) as any
    expect(listed.checking).toBe(true)
    expect(listed.scenarios.map((s: any) => s.id)).toEqual(expect.arrayContaining(['seats.door', 'seats.desk']))
  })
})

describe('a marked request (PM-02, PM-03, M1 to M4)', () => {
  it('runs in the store and leaves the real database, queues and jobs as they were (T-PM-01)', async () => {
    const me = admin()
    const { body } = await begin(me)
    const show = body.to.split('/').pop()
    const before = await fingerprint()
    const response = await marked(me, 'POST', `/api/seats/${show}/sell`, { quantity: 2 })
    expect(response.status).toBe(200)
    expect(await storeOf(me.accountId!).prepare('SELECT sold FROM seats_performances WHERE id = ?').bind(show).first('sold')).toBe(5)
    expect(await storeOf(me.accountId!).prepare('SELECT count(*) AS n FROM core_events').first('n')).toBeGreaterThan(0)
    expect(await fingerprint()).toEqual(before)
    expect(sent).toEqual([])
  })

  it('holds the scenario\'s abilities, not the person\'s own roles (M6)', async () => {
    const me = admin()
    const { body } = await begin(me, 'seats.desk')
    const response = await marked(me, 'POST', `/api/seats/${body.to.split('/').pop()}/sell`, { quantity: 1 })
    expect(response.status).toBe(403)
  })

  it('refuses a mark from someone signed out, or with no store (T-PM-03, M3)', async () => {
    const anonymous = await call(handle, 'POST', '/api/seats/sp_x/sell', { body: { quantity: 1 }, headers: { ...MARK, 'idempotency-key': 'k' } })
    expect((await anonymous.json() as any).code).toBe('core.practice.not-allowed')
    const none = await marked(admin(), 'GET', '/api/core/practice/session')
    expect(none.status).toBe(409)
    expect((await none.json() as any).code).toBe('core.practice.ended')
  })

  it('refuses an unmarked change sent from a practice page (T-PM-02, M2)', async () => {
    const me = admin()
    const show = await performance(5)
    const before = await fingerprint()
    const response = await call(handle, 'POST', `/api/seats/${show}/sell`, { actor: { ...me, grants: [{ ability: 'seats.orders.sell', via: 'role' }] }, body: { quantity: 1 }, headers: { 'referer': 'http://test/practice/live/door', 'idempotency-key': 'k2' } })
    expect(response.status).toBe(409)
    expect((await response.json() as any).code).toBe('core.practice.unmarked-request')
    expect(await fingerprint()).toEqual(before)
  })

  it('keeps sign-in, passkeys, recovery and the like real-only (T-PM-04, M4)', async () => {
    const me = admin()
    await begin(me)
    const response = await marked(me, 'POST', '/api/core/me/reassert', {})
    expect(response.status).toBe(403)
    expect((await response.json() as any).code).toBe('core.practice.not-in-practice')
  })

  it('accepts the pretend "confirm it\'s you" press in the store only (T-PM-21)', async () => {
    const me = admin()
    await begin(me)
    const response = await marked(me, 'POST', '/api/core/practice/reassert', {})
    expect(response.status).toBe(200)
    expect((await readSessionAs(me.accountId!))?.reasserted_at).toBeGreaterThan(0)
  })
})

describe('tasks (PM-13, T1 to T3)', () => {
  it('ticks a task once its change commits, and it stays ticked (T-PM-17)', async () => {
    const me = admin()
    const { body } = await begin(me)
    const panel = async () => (await marked(me, 'GET', '/api/core/practice/session').then(r => r.json()) as any).tasks
    expect((await panel())[0].passedAt).toBeNull()
    await marked(me, 'POST', `/api/seats/${body.to.split('/').pop()}/sell`, { quantity: 1 })
    expect((await panel())[0].passedAt).toBeGreaterThan(0)
  })
})

describe('nothing leaves (PM-05, O1, O2)', () => {
  it('records a declared call\'s practice answer and settles it with the trainee\'s choice (T-PM-05, T-PM-20)', async () => {
    const me = admin()
    await begin(me)
    const chargeId = newId('sc')
    const result = await inStore(me.accountId!, async () => {
      await createUnit().add({ sql: 'INSERT INTO seats_charges (id, amount, state) VALUES (?, 500, \'pending\')', params: [chargeId] }).commit()
      return externalCall('seats.take-payment', { reference: ['seats.charge', chargeId], call: async () => { throw new Error('the provider must not be called') } })
    })
    expect(result.state).toBe('unknown')
    const waiting = (await marked(me, 'GET', '/api/core/practice/session').then(r => r.json()) as any).waiting
    expect(waiting).toHaveLength(1)
    const answered = await marked(me, 'POST', `/api/core/practice/calls/${waiting[0].attemptId}`, { outcome: 'declined' })
    expect(await answered.json()).toEqual({ state: 'failed' })
    expect(await storeOf(me.accountId!).prepare('SELECT state FROM seats_charges WHERE id = ?').bind(chargeId).first('state')).toBe('failed')
  })

  it('throws on any other server fetch inside a store', async () => {
    const me = admin()
    await begin(me)
    await expect(inStore(me.accountId!, () => fetch('https://example.com'))).rejects.toMatchObject({ code: 'core.practice.no-outside-calls' })
  })
})

describe('email (PM-14, O3)', () => {
  it('lands in the store\'s outbox under the "not sent" line, and the mailer is never called (T-PM-06)', async () => {
    const me = admin()
    await begin(me)
    let mailed = 0
    setMailer(async () => {
      mailed++
      return {}
    })
    try {
      await inStore(me.accountId!, () => useMailer()({ from: { name: 'Box office', email: 'box@practice.invalid' }, to: 'ash.example@practice.invalid', subject: 'Your tickets', text: 'See you tonight.', html: '<p>See you tonight.</p>' }))
    }
    finally {
      setMailer()
    }
    expect(mailed).toBe(0)
    const outbox = (await marked(me, 'GET', '/api/core/practice/session').then(r => r.json()) as any).outbox
    expect(outbox).toMatchObject([{ to: 'ash.example@practice.invalid', subject: 'Your tickets' }])
    const text = await storeOf(me.accountId!).prepare('SELECT body_text FROM core_practice_outbox').first<string>('body_text')
    expect(text?.startsWith(PRACTICE_NOT_SENT)).toBe(true)
  })
})

describe('sample people (PM-07, T-PM-09)', () => {
  it('are fictional: addresses that cannot be delivered and phone numbers kept for drama', async () => {
    const me = admin()
    await begin(me)
    const store = storeOf(me.accountId!)
    const addresses = (await store.prepare('SELECT address FROM core_account_emails').all<{ address: string }>()).results
    expect(addresses.length).toBeGreaterThan(30)
    expect(addresses.every(a => a.address.endsWith('@practice.invalid'))).toBe(true)
    const phones = (await store.prepare('SELECT phone FROM core_accounts WHERE phone IS NOT NULL').all<{ phone: string }>()).results
    expect(phones.every(p => /^07700 900\d{3}$/.test(p.phone))).toBe(true)
  })
})

describe('ending (PM-09, PM-19, S5, S7, S9)', () => {
  it('leaves nothing behind: no storage, files or cache keys (T-PM-11)', async () => {
    const me = admin()
    await begin(me)
    await inStore(me.accountId!, async () => {
      const { env: own } = (await import('#kit/context')).useContext()
      await own.FILES!.put('receipt.txt', 'practice')
      await own.CACHE!.put('door-count', '1')
    })
    expect((await env.FILES!.list({ prefix: filesPrefix(me.accountId!) })).objects).toHaveLength(1)
    await call(handle, 'POST', '/api/core/practice/leave', { actor: me, body: {} })
    expect(await readSessionAs(me.accountId!)).toBeNull()
    expect((await env.FILES!.list({ prefix: filesPrefix(me.accountId!) })).objects).toHaveLength(0)
    expect((await env.CACHE!.list({ prefix: cachePrefix(me.accountId!) })).keys).toHaveLength(0)
    expect((await call(handle, 'GET', '/api/core/practice', { actor: me }).then(r => r.json()) as any).ended).toMatchObject({ reason: 'left' })
  })

  it('ends a store made from another migration bundle at its next request (T-PM-12)', async () => {
    const me = admin()
    await begin(me)
    await storeOf(me.accountId!).prepare('UPDATE core_practice_session SET bundle_hash = ?').bind('an-older-release').run()
    const response = await marked(me, 'GET', '/api/core/practice/session')
    expect((await response.json() as any).code).toBe('core.practice.ended')
    expect((await call(handle, 'GET', '/api/core/practice', { actor: me }).then(r => r.json()) as any).ended).toMatchObject({ reason: 'updated' })
  })

  it('ends a session left idle', async () => {
    const me = admin()
    await begin(me)
    await storeOf(me.accountId!).prepare('UPDATE core_practice_session SET ends_at = 1').run()
    expect((await marked(me, 'GET', '/api/core/practice/session').then(r => r.json()) as any).code).toBe('core.practice.ended')
    expect(await readSessionAs(me.accountId!)).toBeNull()
  })

  it('ends every session at its next request once practice is switched off (T-PM-22)', async () => {
    const me = admin()
    await begin(me)
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit, 'core.practice.enabled', false, { confirm: true })
      await unit.commit()
    })
    try {
      expect((await marked(me, 'GET', '/api/core/practice/session').then(r => r.json()) as any).code).toBe('core.practice.ended')
    }
    finally {
      await inContext(async () => {
        const unit = createUnit()
        await changeSetting(unit, 'core.practice.enabled', true, { confirm: true })
        await unit.commit()
      })
    }
  })

  it('erasing a person leaves no store (T-PM-23)', async () => {
    const id = newId('acc')
    await env.DB.prepare('INSERT INTO core_accounts (id, name, origin, created_at) VALUES (?, ?, \'staff\', ?)').bind(id, 'Erased Learner', Date.now()).run()
    const me = admin()
    await begin({ ...me, accountId: id })
    expect(await readSessionAs(id)).not.toBeNull()
    await inContext(() => eraseAccount(id))
    expect(await readSessionAs(id)).toBeNull()
  })
})

function readSessionAs(accountId: string) {
  return inContext(() => readSession(accountId))
}
