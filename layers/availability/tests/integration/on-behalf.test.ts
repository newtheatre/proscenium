// On someone's behalf, who can see me, and retention (AV-20, AV-21, AV-23): T-AV-26, T-AV-27, T-AV-30.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { crews } from '../../../../tests/fixtures/modules/crews/server/contributions/availability.group/crews'
import addFor from '../../server/api/availability/on-behalf/index.post'
import listFor from '../../server/api/availability/on-behalf/index.get'
import dropFor from '../../server/api/availability/on-behalf/[id].delete'
import dropOwn from '../../server/api/availability/exceptions/[id].delete'
import newException from '../../server/api/availability/exceptions/index.post'
import privacy from '../../server/api/availability/privacy.get'
import { openRequest, closeRequest, sweepRequests } from '../../server/requests'
import { sweepPastEntries } from '../../server/entries'

const app = server({
  'POST /api/availability/on-behalf': addFor,
  'GET /api/availability/on-behalf': listFor,
  'DELETE /api/availability/on-behalf/:id': dropFor,
  'POST /api/availability/exceptions': newException,
  'DELETE /api/availability/exceptions/:id': dropOwn,
  'GET /api/availability/privacy': privacy,
})

const NOV_24 = Date.UTC(2026, 10, 24, 9)

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function run(write: (unit: UnitView) => unknown | Promise<unknown>) {
  await inContext(async () => {
    const unit = createUnit()
    await write(unit.view())
    await unit.commit()
  })
}

async function account(name: string): Promise<Actor> {
  const who = person([])
  await rows('INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES (?, ?, \'self\', ?, ?)', who.accountId, name, NOV_24, NOV_24)
  return who
}

const away = (fields: Record<string, unknown> = {}) => ({ firstDate: '2027-03-12', lastDate: '2027-03-12', weekdays: null, from: null, until: null, level: 'busy', reason: 'Phoned in', reasonShared: false, ...fields })

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('availability', true)
  await setModule('crews', true)
  await run(unit => changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
})

describe('on someone\'s behalf (A8, T-AV-26)', () => {
  it('lets a planner mark a member busy, tells them, and refuses free, outsiders and holders of find.anyone alone', async () => {
    const [ana, outsider] = [await account('Ana'), await account('Out')]
    const planner = await account('Pat Planner')
    planner.grants = [{ ability: 'availability.entry.on-behalf', via: 'role' }] as Actor['grants']
    crews.set('crews:behalf', { label: 'Behalf', members: [ana.accountId!], planners: [planner.accountId!] })

    const made = await req(planner, 'POST', '/api/availability/on-behalf', { accountId: ana.accountId, ...away({ reasonShared: true }) })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(await rows('SELECT entered_by, reason_shared, level FROM availability_exceptions WHERE id = ?', made.body.exceptionId)).toEqual([{ entered_by: planner.accountId, reason_shared: 0, level: 'busy' }])
    expect(await rows('SELECT count(*) AS n FROM core_notifications WHERE type_key = \'availability.entry-added-for-you\' AND account_id = ?', ana.accountId)).toEqual([{ n: 1 }])

    expect((await req(planner, 'POST', '/api/availability/on-behalf', { accountId: ana.accountId, ...away({ level: 'free' }) })).body.code).toBe('availability.on-behalf.level')
    expect((await req(planner, 'POST', '/api/availability/on-behalf', { accountId: outsider.accountId, ...away() })).status).toBe(403)
    const anyone = person(['availability.entry.on-behalf', 'availability.find.anyone'])
    expect((await req(anyone, 'POST', '/api/availability/on-behalf', { accountId: ana.accountId, ...away() })).status).toBe(403)
    expect((await req(person([]), 'POST', '/api/availability/on-behalf', { accountId: ana.accountId, ...away() })).status).toBe(403)

    expect((await req(planner, 'GET', `/api/availability/on-behalf?accountId=${ana.accountId}`)).body.entries).toMatchObject([{ id: made.body.exceptionId, level: 'busy', reason: 'Phoned in' }])
  })

  it('lets the planner remove only what they added, and the person remove anything of theirs', async () => {
    const ana = await account('Ana')
    const planner = await account('Pat Planner')
    planner.grants = [{ ability: 'availability.entry.on-behalf', via: 'role' }] as Actor['grants']
    crews.set('crews:remove', { label: 'Remove', members: [ana.accountId!], planners: [planner.accountId!] })
    const own = await req(ana, 'POST', '/api/availability/exceptions', away({ firstDate: '2027-03-13', lastDate: '2027-03-13' }))
    const theirs = await req(planner, 'POST', '/api/availability/on-behalf', { accountId: ana.accountId, ...away({ level: 'maybe' }) })
    const another = await req(planner, 'POST', '/api/availability/on-behalf', { accountId: ana.accountId, ...away({ firstDate: '2027-03-14', lastDate: '2027-03-14' }) })

    expect((await req(planner, 'DELETE', `/api/availability/on-behalf/${own.body.exceptionId}`, {})).status).toBe(404)
    expect((await req(planner, 'DELETE', `/api/availability/on-behalf/${theirs.body.exceptionId}`, {})).status).toBe(200)
    expect((await req(ana, 'DELETE', `/api/availability/exceptions/${another.body.exceptionId}`, {})).status).toBe(200)
    expect(await rows('SELECT id FROM availability_exceptions WHERE account_id = ?', ana.accountId)).toEqual([{ id: own.body.exceptionId }])
  })
})

describe('who can see my availability (S6, T-AV-27)', () => {
  it('lists the person\'s groups and who plans for each, and nothing about anyone else', async () => {
    const [ana, ben] = [await account('Ana'), await account('Ben')]
    crews.set('crews:panto', { label: 'Panto crew', members: [ana.accountId!, ben.accountId!], planners: [] })
    crews.set('crews:committee', { label: 'Committee', members: [ana.accountId!], planners: [] })
    const seen = await req(ana, 'GET', '/api/availability/privacy')
    expect(seen.body.groups).toEqual(expect.arrayContaining([
      { id: 'crews:panto', label: 'Panto crew', plannedBy: 'The crew chiefs' },
      { id: 'crews:committee', label: 'Committee', plannedBy: 'The crew chiefs' },
    ]))
    expect(JSON.stringify(seen.body)).not.toContain(ben.accountId!)
  })
})

describe('retention (T-AV-30)', () => {
  it('removes exceptions past retention.past and requests closed longer than retention.history, and nothing newer', async () => {
    const ana = await account('Ana')
    setClock(Date.UTC(2026, 11, 1, 9))
    const old = await req(ana, 'POST', '/api/availability/exceptions', away({ firstDate: '2026-12-02', lastDate: '2026-12-02' }))
    const recent = await req(ana, 'POST', '/api/availability/exceptions', away({ firstDate: '2027-02-01', lastDate: '2027-02-01' }))
    const sourceRef = `rehearsals.schedule:${newId('rhs')}`
    let requestId = ''
    await run(async (unit) => { requestId = (await openRequest(unit, { sourceRef, groupIds: [], accountIds: [ana.accountId!], from: '2026-12-02', to: '2026-12-03', dueOn: '2026-12-02', title: 'Old', message: null, openedBy: ana.accountId! })).requestId })
    await run(unit => closeRequest(unit, sourceRef))

    setClock(Date.UTC(2027, 2, 3, 5))
    await run(sweepPastEntries)
    expect(await rows('SELECT id FROM availability_exceptions WHERE account_id = ?', ana.accountId)).toEqual([{ id: recent.body.exceptionId }])
    expect(old.status).toBe(200)

    await run(sweepRequests)
    expect(await rows('SELECT count(*) AS n FROM availability_requests WHERE id = ?', requestId)).toEqual([{ n: 1 }])
    setClock(Date.UTC(2027, 11, 3, 5))
    await run(sweepRequests)
    expect(await rows('SELECT count(*) AS n FROM availability_requests WHERE id = ?', requestId)).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM availability_request_people WHERE request_id = ?', requestId)).toEqual([{ n: 0 }])
  })
})
