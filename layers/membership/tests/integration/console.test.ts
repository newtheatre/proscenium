// Membership in the console's shared places (tab 4): members found from the command palette by name or
// number and shown by scheme and number, never by name; records given titles wherever they are
// listed; and the health checks for applications left waiting, open schemes missing something, and
// reminders that have stopped.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import searchGet from '../../server/api/membership/search.get'
import accountMemberships from '../../server/api/membership/accounts/[id]/memberships.get'
import applicationsCount from '../../server/contributions/core.count/applications-waiting'
import schemeResolver from '../../server/contributions/core.record-resolver/scheme'
import membershipResolver from '../../server/contributions/core.record-resolver/membership'
import applicationsWaiting from '../../server/contributions/core.health-check/applications-waiting'
import openSchemes from '../../server/contributions/core.health-check/open-schemes'
import remindersRan from '../../server/contributions/core.health-check/reminders-ran'
import { NOV_17, applicant, ready, req, scheme } from './stage'

const search = server({ 'GET /api/membership/search': searchGet, 'GET /api/membership/accounts/:id/memberships': accountMemberships })
const viewer = person(['membership.membership.view'], { reassertedAt: NOV_17 })
const find = async (q: string, actor = viewer) => {
  const response = await call(search, 'GET', `/api/membership/search?q=${encodeURIComponent(q)}`, { actor })
  return { status: response.status, body: await response.json() as any }
}
const setting = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
  await unit.commit()
})

async function joined(name: string, fields: Record<string, unknown> = {}) {
  const id = await scheme(fields)
  expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
  const who = await applicant(name)
  const done = await req('POST', `/api/membership/schemes/${id}/join`, {}, who)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return { schemeId: id, membershipId: done.body.membershipId as string, who }
}

beforeAll(ready)

describe('finding members from the palette', () => {
  it('finds a member by name or number and titles them by scheme and number', async () => {
    const m = await joined('Palette Person')
    const found = await find('Palette')
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.ids).toContain(m.membershipId)
    const resolved = await inContext(() => membershipResolver.resolve(m.membershipId))
    expect(resolved).toMatchObject({ to: `/console/membership/memberships/${m.membershipId}`, parent: { type: 'membership.scheme', id: m.schemeId } })
    expect(resolved!.title).toMatch(/^Scheme \d+, M-\d+$/)
    expect(resolved!.title).not.toContain('Palette')
    expect((await find(resolved!.title.split(', ')[1]!)).body.ids).toContain(m.membershipId)
    expect(await inContext(() => schemeResolver.resolve(m.schemeId))).toMatchObject({ title: expect.stringMatching(/^Scheme \d+$/), to: `/admin/modules/membership/schemes/${m.schemeId}` })
    expect((await find('')).body.ids).toEqual([])
    expect((await find('Palette', person([]))).status).toBe(403)
  })
})

describe('a person\'s Membership tab and the applications count', () => {
  it('lists a person\'s memberships with their number, and counts applications waiting for those who may see them', async () => {
    const m = await joined('Tab Person')
    const tab = await call(search, 'GET', `/api/membership/accounts/${m.who.accountId}/memberships`, { actor: viewer })
    const body = await tab.json() as any
    expect(tab.status, JSON.stringify(body)).toBe(200)
    expect(body).toMatchObject({ number: expect.stringMatching(/^M-\d+$/), memberships: [{ id: m.membershipId, status: 'current', startsOn: '2026-11-17' }] })
    expect((await call(search, 'GET', `/api/membership/accounts/${m.who.accountId}/memberships`, { actor: person([]) })).status).toBe(403)

    const id = await scheme()
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.staff' })).status).toBe(200)
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
    const before = await inContext(() => applicationsCount.value(viewer as never))
    await req('POST', `/api/membership/schemes/${id}/join`, {}, await applicant('Counted Applicant'))
    expect(await inContext(() => applicationsCount.value(viewer as never))).toBe(before + 1)
    expect(await inContext(() => applicationsCount.value(person([]) as never))).toBe(0)
  })
})

describe('health checks', () => {
  it('warns of applications waiting on staff for more than a week', async () => {
    const id = await scheme()
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { verifier: 'membership.staff' })).status).toBe(200)
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
    const applied = await req('POST', `/api/membership/schemes/${id}/join`, {}, await applicant('Left Waiting'))
    expect(applied.body, JSON.stringify(applied.body)).toMatchObject({ pending: true, waiting: 'staff-check' })
    expect((await inContext(() => applicationsWaiting.check())).state).toBe('ok')
    setClock(NOV_17 + 8 * 86_400_000)
    try {
      expect(await inContext(() => applicationsWaiting.check())).toMatchObject({ state: 'warning', sentence: expect.stringContaining('waited for a check') })
    }
    finally {
      setClock(NOV_17)
    }
  })

  it('fails while an open scheme is missing something it needs', async () => {
    await joined('Open Scheme Holder')
    expect((await inContext(() => openSchemes.check())).state).toBe('ok')
    await setting('core.members-area.enabled', false)
    expect(await inContext(() => openSchemes.check())).toMatchObject({ state: 'failing' })
    await setting('core.members-area.enabled', true)
  })

  it('warns when renewal reminders have not run for two days', async () => {
    await joined('Needs Reminding')
    expect((await inContext(() => remindersRan.check())).state).toBe('warning')
    await rows('INSERT INTO core_task_runs (task, due_at, started_at, finished_at, outcome) VALUES (\'membership.send-reminders\', ?, ?, ?, \'done\') RETURNING task', NOV_17, NOV_17, NOV_17)
    expect((await inContext(() => remindersRan.check())).state).toBe('ok')
  })
})
