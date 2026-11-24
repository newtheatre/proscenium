// Arranged meetings (AV-18): arranging from groups or a decided poll, answers, moving and changing,
// cancelling, firm busy time through core.person-busy, and retention (T-AV-23, T-AV-24).
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor, type UnitView } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { crews } from '../../../../tests/fixtures/modules/crews/server/contributions/availability.group/crews'
import { personsBusy } from '../../../person-busy/server/services'
import arrangePost from '../../server/api/availability/meetings/index.post'
import mine from '../../server/api/availability/meetings/index.get'
import arranged from '../../server/api/availability/meetings/arranged.get'
import view from '../../server/api/availability/meetings/[id]/index.get'
import changePut from '../../server/api/availability/meetings/[id]/index.put'
import respondPost from '../../server/api/availability/meetings/[id]/respond.post'
import cancelPost from '../../server/api/availability/meetings/[id]/cancel.post'
import pollPost from '../../server/api/availability/polls/index.post'
import pollView from '../../server/api/availability/polls/[id]/index.get'
import decidePost from '../../server/api/availability/polls/[id]/decide.post'
import { sweepOldMeetings } from '../../server/meetings'

const app = server({
  'POST /api/availability/meetings': arrangePost,
  'GET /api/availability/meetings': mine,
  'GET /api/availability/meetings/arranged': arranged,
  'GET /api/availability/meetings/:id': view,
  'PUT /api/availability/meetings/:id': changePut,
  'POST /api/availability/meetings/:id/respond': respondPost,
  'POST /api/availability/meetings/:id/cancel': cancelPost,
  'POST /api/availability/polls': pollPost,
  'GET /api/availability/polls/:id': pollView,
  'POST /api/availability/polls/:id/decide': decidePost,
})

const NOV_24 = Date.UTC(2026, 10, 24, 9)
const TUESDAY = '2027-01-12'
const at = (h: number) => Date.UTC(2027, 0, 12, h)

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

const told = async (type: string, who: Actor) => ((await rows('SELECT count(*) AS n FROM core_notifications WHERE type_key = ? AND account_id = ?', type, who.accountId)) as { n: number }[])[0]!.n
const meeting = (fields: Record<string, unknown> = {}) => ({ title: 'Production meeting', date: TUESDAY, start: 1080, end: 1170, place: 'Green room', notes: null, groupIds: ['crews:meet'], accountIds: [], findId: null, ...fields })
const busyOf = async (who: Actor) => (await inContext(() => personsBusy([who.accountId!], at(0), at(24)))).filter(r => r.kind === 'meeting')

let ana: Actor, ben: Actor, organiser: Actor

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('availability', true)
  await setModule('occupancy', true)
  await setModule('crews', true)
  await run(unit => changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  ;[ana, ben] = [await account('Ana'), await account('Ben')]
  organiser = await account('Ola')
  organiser.grants = ['availability.find.use', 'availability.meeting.arrange'].map(ability => ({ ability, via: 'role' })) as Actor['grants']
  crews.set('crews:meet', { label: 'Meeting crew', members: [ana.accountId!, ben.accountId!], planners: [organiser.accountId!] })
})

describe('arranging and answering (M1, M2, M5, T-AV-23)', () => {
  it('invites the group once, takes answers, and holds everyone not saying not going as busy', async () => {
    expect((await req(person(['availability.meeting.arrange']), 'POST', '/api/availability/meetings', meeting())).status).toBe(403)
    expect((await req(organiser, 'POST', '/api/availability/meetings', meeting({ date: '2026-11-23' }))).body.code).toBe('availability.meeting.past')
    const made = await req(organiser, 'POST', '/api/availability/meetings', meeting())
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const id = made.body.meetingId
    expect(made.body.invited).toBe(2)
    expect(await told('availability.meeting-invited', ana)).toBe(1)
    expect(await busyOf(ana)).toEqual([expect.objectContaining({ from: at(18), to: at(19) + 30 * 60_000, firm: true, labelKey: 'availability.meeting', source: 'availability' })])

    expect((await req(ben, 'POST', `/api/availability/meetings/${id}/respond`, { response: 'not-going' })).status).toBe(200)
    expect(await busyOf(ben)).toEqual([])
    expect((await req(ana, 'POST', `/api/availability/meetings/${id}/respond`, { response: 'going' })).status).toBe(200)
    expect((await req(person([]), 'POST', `/api/availability/meetings/${id}/respond`, { response: 'going' })).body.code).toBe('availability.meeting.cannot-answer')

    const anaView = await req(ana, 'GET', `/api/availability/meetings/${id}`)
    expect(anaView.body).toMatchObject({ mine: 'going', organiser: false, counts: { 'going': 1, 'not-going': 1, 'pending': 0 } })
    expect(anaView.body.invitees).toBeUndefined()
    expect((await req(person([]), 'GET', `/api/availability/meetings/${id}`)).status).toBe(404)
    expect((await req(organiser, 'GET', `/api/availability/meetings/${id}`)).body.invitees.map((p: { name: string, response: string }) => `${p.name} ${p.response}`)).toEqual(['Ana going', 'Ben not-going'])
    expect((await req(ana, 'GET', '/api/availability/meetings')).body.meetings).toMatchObject([{ id, response: 'going', going: 1, invited: 2 }])
    expect((await req(organiser, 'GET', '/api/availability/meetings/arranged')).body.meetings).toMatchObject([{ id, going: 1, invited: 2 }])
  })
})

describe('moving, changing and cancelling (M3, M4, T-AV-24)', () => {
  it('resets answers on a new time, tells people of other changes only when asked, and cancels once', async () => {
    const { body: { meetingId: id } } = await req(organiser, 'POST', '/api/availability/meetings', meeting({ title: 'Moves' }))
    await req(ana, 'POST', `/api/availability/meetings/${id}/respond`, { response: 'going' })
    const quiet = await req(organiser, 'PUT', `/api/availability/meetings/${id}`, { title: 'Moves', date: TUESDAY, start: 1080, end: 1170, place: 'Bar', notes: null, tell: false })
    expect(quiet.body).toEqual({ moved: false })
    expect(await told('availability.meeting-changed', ana)).toBe(0)
    const moved = await req(organiser, 'PUT', `/api/availability/meetings/${id}`, { title: 'Moves', date: TUESDAY, start: 1140, end: 1200, place: 'Bar', notes: null, tell: false })
    expect(moved.body).toEqual({ moved: true })
    expect(await told('availability.meeting-moved', ana)).toBe(1)
    expect((await req(ana, 'GET', `/api/availability/meetings/${id}`)).body).toMatchObject({ mine: 'pending', local: { date: TUESDAY, start: 1140, end: 1200 } })
    expect((await req(ana, 'PUT', `/api/availability/meetings/${id}`, { title: 'Mine now', date: TUESDAY, start: 1140, end: 1200, place: null, notes: null, tell: true })).status).toBe(403)

    expect((await req(organiser, 'POST', `/api/availability/meetings/${id}/cancel`, { reason: 'Clash with the get-in' })).status).toBe(200)
    expect((await req(organiser, 'POST', `/api/availability/meetings/${id}/cancel`, { reason: null })).body.code).toBe('availability.meeting.over')
    expect(await told('availability.meeting-cancelled', ben)).toBe(1)
    expect((await busyOf(ana)).some(r => r.record?.id === id)).toBe(false)
  })
})

describe('from a decided poll (M1)', () => {
  it('invites the poll\'s people and links the poll to the meeting', async () => {
    const { body: { pollId } } = await req(organiser, 'POST', '/api/availability/polls', { title: 'Read-through', groupIds: ['crews:meet'], accountIds: [], must: [], spaceIds: [], length: 60, slots: [{ date: TUESDAY, start: 1080 }, { date: TUESDAY, start: 1200 }], answersBy: '2026-12-01' })
    const { body: { slots } } = await req(organiser, 'GET', `/api/availability/polls/${pollId}`)
    await req(organiser, 'POST', `/api/availability/polls/${pollId}/decide`, { slotId: slots[1].id })
    const made = await req(organiser, 'POST', '/api/availability/meetings', meeting({ title: 'Read-through', start: 1200, end: 1260, groupIds: [], findId: pollId }))
    expect(made.body.invited).toBe(2)
    expect((await req(organiser, 'GET', `/api/availability/polls/${pollId}`)).body.poll.meetingId).toBe(made.body.meetingId)
    expect((await req(person(['availability.meeting.arrange']), 'POST', '/api/availability/meetings', meeting({ groupIds: [], findId: pollId }))).status).toBe(404)
  })
})

describe('retention (AV-23)', () => {
  it('deletes a meeting and its invitees a year after it ended', async () => {
    const { body: { meetingId: id } } = await req(organiser, 'POST', '/api/availability/meetings', meeting({ title: 'Old' }))
    setClock(Date.UTC(2027, 11, 1))
    await run(sweepOldMeetings)
    expect(await rows('SELECT count(*) AS n FROM availability_meetings WHERE id = ?', id)).toEqual([{ n: 1 }])
    setClock(Date.UTC(2028, 0, 13))
    await run(sweepOldMeetings)
    expect(await rows('SELECT count(*) AS n FROM availability_meetings WHERE id = ?', id)).toEqual([{ n: 0 }])
    expect(await rows('SELECT count(*) AS n FROM availability_meeting_invitees WHERE meeting_id = ?', id)).toEqual([{ n: 0 }])
  })
})
