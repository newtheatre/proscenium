// The membership gate's first part (MEM-01, 02, 06, 07, 08, 11, 24, 56): a scheme is set up as a
// draft with its lengths, opens only when ready, and a free scheme is joined in one request; staff
// add a member by address; the standing follows the dates with nothing run, on the right side only.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, fact, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import schemesGet from '../../server/api/membership/schemes/index.get'
import schemesAll from '../../server/api/membership/schemes/all.get'
import schemesPost from '../../server/api/membership/schemes/index.post'
import schemeGet from '../../server/api/membership/schemes/[id].get'
import schemePatch from '../../server/api/membership/schemes/[id].patch'
import schemeDelete from '../../server/api/membership/schemes/[id].delete'
import statePost from '../../server/api/membership/schemes/[id]/state.post'
import optionsPost from '../../server/api/membership/schemes/[id]/options/index.post'
import optionPatch from '../../server/api/membership/schemes/[id]/options/[optionId].patch'
import membersPost from '../../server/api/membership/schemes/[id]/members.post'
import joinPost from '../../server/api/membership/schemes/[id]/join.post'
import mineGet from '../../server/api/membership/mine.get'

const handle = server({
  'GET /api/membership/schemes': schemesGet,
  'GET /api/membership/schemes/all': schemesAll,
  'POST /api/membership/schemes': schemesPost,
  'GET /api/membership/schemes/:id': schemeGet,
  'PATCH /api/membership/schemes/:id': schemePatch,
  'DELETE /api/membership/schemes/:id': schemeDelete,
  'POST /api/membership/schemes/:id/state': statePost,
  'POST /api/membership/schemes/:id/options': optionsPost,
  'PATCH /api/membership/schemes/:id/options/:optionId': optionPatch,
  'POST /api/membership/schemes/:id/members': membersPost,
  'POST /api/membership/schemes/:id/join': joinPost,
  'GET /api/membership/mine': mineGet,
})

const NOV_17 = Date.UTC(2026, 10, 17, 12)
const officer = person(['membership.scheme.manage', 'membership.membership.add'], { reassertedAt: NOV_17 })

async function req<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | null = officer): Promise<{ status: number, body: T }> {
  const headers = method === 'POST' ? { 'idempotency-key': newId('req') } : {}
  const response = await call(handle, method, path, { actor: actor ?? undefined, body, headers })
  return { status: response.status, body: await response.json() as T }
}

let n = 0
async function scheme(fields: Record<string, unknown> = {}, lengths: number[] = [12]): Promise<string> {
  n++
  const made = await req('POST', '/api/membership/schemes', { key: `scheme-${n}`, name: `Scheme ${n}`, side: 'members', lengthRule: 'rolling', ...fields })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  for (const count of lengths) expect((await req('POST', `/api/membership/schemes/${made.body.schemeId}/options`, { name: `${count} months`, count })).status).toBe(200)
  return made.body.schemeId
}

const holds = (accountId: string, name: string) => inContext(() => fact(name, { kind: 'person', accountId } as any))

beforeAll(async () => {
  setClock(NOV_17)
  resetRateLimits()
  await setModule('membership', true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
})

describe('setting up a scheme', () => {
  it('needs the ability to see or change schemes', async () => {
    const nobody = person([])
    expect((await req('POST', '/api/membership/schemes', { key: 'x', name: 'X', side: 'members', lengthRule: 'rolling' }, nobody)).status).toBe(403)
    expect((await req('GET', '/api/membership/schemes/all', undefined, nobody)).status).toBe(403)
  })

  it('saves a draft with settings for its defaults, and shows the dates a membership taken today would run to', async () => {
    const id = await scheme({}, [12, 36])
    const { body } = await req('GET', `/api/membership/schemes/${id}`)
    expect(body.scheme).toMatchObject({ state: 'draft', side: 'members', renewalOpensDays: 30, graceDays: 0, holderMayEnd: true })
    expect(body.example.map((e: any) => e.endsOn)).toEqual(['2027-11-16', '2029-11-16'])
    expect(body.checklist).toEqual([{ code: 'length-option', done: true }, { code: 'members-area', done: true }])
  })

  it('refuses a fixed scheme with no end date, or one ending on 29 February', async () => {
    expect((await req('POST', '/api/membership/schemes', { key: 'fixed-a', name: 'Fixed', side: 'members', lengthRule: 'fixed' })).body.code).toBe('membership.scheme.fixed-end')
    expect((await req('POST', '/api/membership/schemes', { key: 'fixed-b', name: 'Fixed', side: 'members', lengthRule: 'fixed', fixedEndMonth: 2, fixedEndDay: 29 })).body.code).toBe('membership.scheme.fixed-end-day')
  })

  it('refuses to open without a length, or while it asks for a check that does not exist yet (S4)', async () => {
    const bare = await scheme({}, [])
    expect((await req('POST', `/api/membership/schemes/${bare}/state`, { to: 'open' })).body.code).toBe('membership.scheme.needs-length-option')
    const approved = await scheme({ needsApproval: true })
    expect((await req('POST', `/api/membership/schemes/${approved}/state`, { to: 'open' })).body.code).toBe('membership.scheme.needs-application-form')
  })

  it('moves through open, closed and archived, announcing opening and closing, and deletes only a draft', async () => {
    const id = await scheme()
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'archived' })).status).toBe(409)
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).body).toMatchObject({ state: 'open', holders: 0 })
    expect((await req('DELETE', `/api/membership/schemes/${id}`)).body.code).toBe('membership.scheme.not-deletable')
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { key: 'renamed' })).body.code).toBe('membership.scheme.key-fixed')
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'closed' })).body.state).toBe('closed')
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'archived' })).body.state).toBe('archived')
    expect(await rows('SELECT name FROM core_events WHERE record_id = ? ORDER BY rowid', id)).toEqual([{ name: 'membership.scheme.opened' }, { name: 'membership.scheme.closed' }])
    const draft = await scheme()
    expect((await req('DELETE', `/api/membership/schemes/${draft}`)).body).toEqual({ deleted: true })
  })

  it('lists only open schemes publicly, with their offered lengths', async () => {
    const id = await scheme({}, [12, 36])
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const options = (await req('GET', `/api/membership/schemes/${id}`)).body.options
    await req('PATCH', `/api/membership/schemes/${id}/options/${options[1].id}`, { state: 'withdrawn' })
    const listed = (await req('GET', '/api/membership/schemes', undefined, null)).body.schemes.find((s: any) => s.id === id)
    expect(listed.options.map((o: any) => o.count)).toEqual([12])
  })
})

describe('holding a scheme', () => {
  it('joins a free unchecked scheme in one request, with a member number, and opens the members\' area (MEM-11, MEM-06)', async () => {
    const id = await scheme({ key: 'student', name: 'Student member' }, [12, 36])
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const student = person([])
    const options = (await req('GET', `/api/membership/schemes/${id}`)).body.options
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, student)).body.code).toBe('membership.option.choose')
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { lengthOptionId: options[1].id }, student)
    expect(joined.body).toMatchObject({ startsOn: '2026-11-17', endsOn: '2029-11-16', opensMembersArea: true })
    expect((await req('POST', `/api/membership/schemes/${id}/join`, { lengthOptionId: options[0].id }, student)).body.code).toBe('membership.join.already-held')
    expect(await holds(student.accountId!, 'membership.holder')).toBe(true)
    expect(await holds(student.accountId!, 'membership.supporter')).toBe(false)
    expect(await holds(student.accountId!, 'core.member')).toBe(true)
    const mine = (await req('GET', '/api/membership/mine', undefined, student)).body
    expect(mine.number.label).toMatch(/^M-\d+$/)
    expect(mine.memberships).toMatchObject([{ schemeName: 'Student member', length: '36 months', status: 'current' }])
  })

  it('gives a supporters\' scheme its benefits and never the members\' area (MEM-07)', async () => {
    const id = await scheme({ side: 'audience', lengthRule: 'indefinite' }, [])
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const friend = person([])
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, friend)).body).toMatchObject({ endsOn: null, opensMembersArea: false })
    expect(await holds(friend.accountId!, 'membership.supporter')).toBe(true)
    expect(await holds(friend.accountId!, 'membership.holder')).toBe(false)
    expect(await holds(friend.accountId!, 'core.member')).toBe(false)
    // S2: the side is fixed once anybody has held it.
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { side: 'members' })).body.code).toBe('membership.scheme.side-fixed')
  })

  it('lets staff add a member by address, with dates by hand, and never to themselves (MEM-24)', async () => {
    const id = await scheme({ joinMode: 'staff-only', graceDays: 5 })
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const added = await req('POST', `/api/membership/schemes/${id}/members`, { name: 'Ada Lovelace', address: `ada${n}@example.org`, startsOn: '2026-09-01', endsOn: '2026-12-31', note: 'Backdated' })
    expect(added.body).toMatchObject({ startsOn: '2026-09-01', endsOn: '2026-12-31', opensMembersArea: true })
    expect(await rows('SELECT origin, state, added_by FROM membership_memberships WHERE id = ?', added.body.membershipId)).toEqual([{ origin: 'added', state: 'active', added_by: officer.accountId }])
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, person([]))).body.code).toBe('membership.join.staff-only')
    expect((await req('POST', `/api/membership/schemes/${id}/members`, { accountId: officer.accountId })).status).toBe(404)

    // MEM-08: the standing ends after grace with nothing run.
    expect(await holds(added.body.accountId, 'membership.holder')).toBe(true)
    setClock(Date.UTC(2027, 0, 5, 12))
    expect(await holds(added.body.accountId, 'membership.holder')).toBe(true)
    setClock(Date.UTC(2027, 0, 6, 12))
    expect(await holds(added.body.accountId, 'membership.holder')).toBe(false)
    setClock(NOV_17)
    expect((await req('GET', '/api/membership/schemes/all')).body.schemes.find((s: any) => s.id === id).holders).toBe(1)
  })

  it('refuses staff adding their own account', async () => {
    const id = await scheme()
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const address = `self${n}@example.org`
    const first = await req('POST', `/api/membership/schemes/${id}/members`, { address })
    const self = { ...officer, accountId: first.body.accountId }
    expect((await req('POST', `/api/membership/schemes/${id}/members`, { address }, self)).body.code).toBe('membership.membership.own')
  })
})
