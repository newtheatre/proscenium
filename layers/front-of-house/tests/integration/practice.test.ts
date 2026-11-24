// Practice mode front of house (FH-55, PM-20): front-of-house.on-shift puts tonight's practice play on
// a published rota, the trainee leading it and four practice people confirmed, with an opening
// checklist and the venue's emergency card. front-of-house.night ticks check-in, the checklist and the
// signed-off report; front-of-house.incident ticks opening the card and a first-aid report with people.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, type Actor } from '#kit'
import { newId } from '#kit/ids'
import { guardOutsideCalls, setPracticeGate } from '#kit/practice/gate'
import { practiceStore } from '#kit/practice/env'
import { storeDatabase } from '#kit/practice/database'
import { practiceGate } from '../../../core/server/practice/gate'
import start from '../../../core/server/api/core/practice/start.post'
import session from '../../../core/server/api/core/practice/session.get'
import createVenue from '../../../core/server/api/core/venues/index.post'
import dutiesPost from '../../server/api/front-of-house/duties/index.post'
import cardPut from '../../server/api/front-of-house/emergency-cards/[venueId].put'
import cardsGet from '../../server/api/front-of-house/emergency-cards/index.get'
import cardGet from '../../server/api/front-of-house/emergency-cards/[venueId].get'
import tonightGet from '../../server/api/front-of-house/performances/[id]/tonight.get'
import checkIn from '../../server/api/front-of-house/assignments/[id]/check-in.post'
import runOpen from '../../server/api/front-of-house/performances/[id]/checklists/[checklistId]/open.post'
import itemPut from '../../server/api/front-of-house/performances/[id]/checklists/[checklistId]/items/[itemId].put'
import runComplete from '../../server/api/front-of-house/performances/[id]/checklists/[checklistId]/complete.post'
import reportNotes from '../../server/api/front-of-house/performances/[id]/report/notes.post'
import signOff from '../../server/api/front-of-house/performances/[id]/report/sign-off.post'
import incidentsPost from '../../server/api/front-of-house/incidents/index.post'
import incidentPeople from '../../server/api/front-of-house/incidents/people.get'
import { call, env, inContext, person, rows, saveKey, server, setModule } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/practice/start': start,
  'GET /api/core/practice/session': session,
  'POST /api/core/venues': createVenue,
  'POST /api/front-of-house/duties': dutiesPost,
  'PUT /api/front-of-house/emergency-cards/:venueId': cardPut,
  'GET /api/front-of-house/emergency-cards': cardsGet,
  'GET /api/front-of-house/emergency-cards/:venueId': cardGet,
  'GET /api/front-of-house/performances/:id/tonight': tonightGet,
  'POST /api/front-of-house/assignments/:id/check-in': checkIn,
  'POST /api/front-of-house/performances/:id/checklists/:checklistId/open': runOpen,
  'PUT /api/front-of-house/performances/:id/checklists/:checklistId/items/:itemId': itemPut,
  'POST /api/front-of-house/performances/:id/checklists/:checklistId/complete': runComplete,
  'POST /api/front-of-house/performances/:id/report/notes': reportNotes,
  'POST /api/front-of-house/performances/:id/report/sign-off': signOff,
  'POST /api/front-of-house/incidents': incidentsPost,
  'GET /api/front-of-house/incidents/people': incidentPeople,
})
const MARK = { 'proscenium-practice': '1', 'referer': 'http://test/practice/live/front-of-house' }
const marked = async (actor: Actor, method: string, path: string, body?: unknown) => {
  const response = await call(handle, method, path, { actor, body, headers: { ...MARK, 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any, ticked: response.headers.get('proscenium-practice-ticked') }
}
const real = async (actor: Actor, method: string, path: string, body?: unknown) => {
  const response = await call(handle, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
const many = async <T>(accountId: string, sql: string, ...params: unknown[]) => (await storeDatabase(practiceStore(env, accountId)).prepare(sql).bind(...params).all<T>()).results
const passed = async (me: Actor) => (await marked(me, 'GET', '/api/core/practice/session')).body.tasks.filter((t: any) => t.passedAt).map((t: any) => t.id).sort()

async function begin(me: Actor, scenario: string): Promise<string> {
  const started = await call(handle, 'POST', '/api/core/practice/start', { actor: me, body: { scenario }, headers: MARK })
  const body = await started.json() as any
  expect(started.status, JSON.stringify(body)).toBe(200)
  return decodeURIComponent(body.to.split('/').pop())
}

beforeAll(async () => {
  setPracticeGate(practiceGate)
  guardOutsideCalls()
  await saveKey('CORE_TURNSTILE_SECRET_KEY', null)
  for (const id of ['finance', 'payments', 'box-office', 'front-of-house']) await setModule(id, true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    // The rota's messages carry a calendar link, which must be https.
    await changeSetting(unit.view(), 'core.site.origin', 'https://theatre.example', { reason: 'test', confirm: true })
    await unit.commit()
  })
})
afterAll(() => setPracticeGate(undefined))

describe('practising the night (front-of-house.night) on a site with no front of house set up', () => {
  it('puts tonight on a published rota with the trainee leading, four practice people, an opening checklist and a card', async () => {
    const me = person(['core.practice.manage'])
    const tonight = await begin(me, 'front-of-house.night')
    const id = me.accountId!
    const rota = await many<{ duty: string, lead: number, account_id: string, state: string }>(id, `SELECT d.name AS duty, d.is_lead AS lead, a.account_id, a.state
      FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
      WHERE s.performance_id = ? AND s.state = 'published' ORDER BY d.is_lead DESC, a.created_at`, tonight)
    expect(rota).toHaveLength(5)
    expect(rota[0]).toMatchObject({ duty: 'Duty manager', lead: 1, account_id: id, state: 'confirmed' })
    expect(rota.slice(1).every(r => r.duty === 'Steward' && r.state === 'confirmed' && r.account_id !== id)).toBe(true)
    expect(await many(id, "SELECT name FROM front_of_house_checklists WHERE moment = 'pre-show'")).toEqual([{ name: 'Opening checklist' }])
    const [performance] = await many<{ venue_id: string }>(id, 'SELECT venue_id FROM core_performances WHERE id = ?', tonight)
    expect(await many(id, 'SELECT count(*) AS n FROM front_of_house_emergency_cards WHERE venue_id = ?', performance!.venue_id)).toEqual([{ n: 1 }])

    // The trainee is on shift and leading: the board opens for them with their own place.
    const board = await marked(me, 'GET', `/api/front-of-house/performances/${tonight}/tonight`)
    expect(board.status, JSON.stringify(board.body)).toBe(200)
    expect(board.body.mine).toBeTruthy()
    expect(board.body.can).toMatchObject({ lead: true, checklists: true, report: true })
    expect(await rows('SELECT count(*) AS n FROM front_of_house_shifts')).toEqual([{ n: 0 }])
  })

  it('ticks checking in the team, the opening checklist, and a note in the night report once it is signed off', async () => {
    const me = person(['core.practice.manage'])
    const tonight = await begin(me, 'front-of-house.night')
    const id = me.accountId!
    expect(await passed(me)).toEqual([])

    const [checklist] = await many<{ id: string }>(id, "SELECT id FROM front_of_house_checklists WHERE moment = 'pre-show'")
    const base = `/api/front-of-house/performances/${tonight}/checklists/${checklist!.id}`
    const run = await marked(me, 'POST', `${base}/open`, {})
    expect(run.status, JSON.stringify(run.body)).toBe(200)
    for (const item of run.body.items) expect((await marked(me, 'PUT', `${base}/items/${item.id}`, { outcome: 'done' })).status).toBe(200)
    expect(await passed(me)).toEqual([])
    expect((await marked(me, 'POST', `${base}/complete`, {})).status).toBe(200)
    expect(await passed(me)).toEqual(['opening-checklist'])

    const team = await many<{ id: string }>(id, `SELECT a.id FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE s.performance_id = ? AND a.checked_in_at IS NULL ORDER BY a.created_at`, tonight)
    // Entering the checklist checked the trainee in, so only the four stewards are left.
    expect(team).toHaveLength(4)
    for (const [i, place] of team.entries()) {
      expect((await marked(me, 'POST', `/api/front-of-house/assignments/${place.id}/check-in`, {})).status).toBe(200)
      expect((await passed(me)).includes('check-in')).toBe(i === team.length - 1)
    }

    expect((await marked(me, 'POST', `/api/front-of-house/performances/${tonight}/report/notes`, { topic: 'audience', body: 'A quiet night.' })).status).toBe(200)
    expect(await passed(me)).toEqual(['check-in', 'opening-checklist'])
    const signed = await marked(me, 'POST', `/api/front-of-house/performances/${tonight}/report/sign-off`, {})
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)
    expect(await passed(me)).toEqual(['check-in', 'night-report', 'opening-checklist'])
  })
})

describe('practising an incident (front-of-house.incident) with the theatre\'s own front of house', () => {
  const manager = person(['core.venue.manage', 'front-of-house.duty.manage', 'front-of-house.checklist.manage'])
  let venueId = ''

  beforeAll(async () => {
    const venue = await real(manager, 'POST', '/api/core/venues', { name: 'The Practice Hall' })
    expect(venue.status, JSON.stringify(venue.body)).toBe(200)
    venueId = venue.body.venueId
    expect((await real(manager, 'PUT', `/api/front-of-house/emergency-cards/${venueId}`, { body: 'Assemble on the green.', reviewed: true })).status).toBe(200)
    expect((await real(manager, 'POST', '/api/front-of-house/duties', { name: 'House manager', isLead: true, callBeforeMinutes: 90, stayAfterMinutes: 30 })).status).toBe(200)
  })

  it('carries the theatre\'s duties and card into the store, and ticks opening the card and a first-aid report with people', async () => {
    const me = person(['core.practice.manage'])
    const tonight = await begin(me, 'front-of-house.incident')
    const id = me.accountId!
    const [lead] = await many<{ duty: string }>(id, `SELECT d.name AS duty FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      JOIN front_of_house_duties d ON d.id = s.duty_id WHERE s.performance_id = ? AND a.account_id = ?`, tonight, id)
    expect(lead).toEqual({ duty: 'House manager' })
    expect(await passed(me)).toEqual([])

    // Keeping every card on the device is not finding one; opening the venue's card is.
    expect((await marked(me, 'GET', '/api/front-of-house/emergency-cards')).status).toBe(200)
    expect(await passed(me)).toEqual([])
    const card = await marked(me, 'GET', `/api/front-of-house/emergency-cards/${venueId}`)
    expect(card.status, JSON.stringify(card.body)).toBe(200)
    expect(card.body.card).toMatchObject({ venueId, body: 'Assemble on the green.' })
    expect(card.ticked).toBe('1')
    expect(await passed(me)).toEqual(['emergency-card'])

    const report = { kind: 'incident', occurredAt: Date.now() - 60_000, performanceId: tonight, venueId, whatHappened: 'Someone tripped on the stairs.' }
    expect((await marked(me, 'POST', '/api/front-of-house/incidents', { ...report, firstAidGiven: true })).status).toBe(200)
    expect(await passed(me)).toEqual(['emergency-card'])
    const crew = await marked(me, 'GET', `/api/front-of-house/incidents/people?performance=${tonight}&q=${encodeURIComponent('ash')}`)
    expect(crew.body.people.length, JSON.stringify(crew.body)).toBeGreaterThan(0)
    const people = [{ accountId: crew.body.people[0].id, involvement: 'helped' }, { name: 'A member of the audience', involvement: 'affected' }]
    const sent = await marked(me, 'POST', '/api/front-of-house/incidents', { ...report, firstAidGiven: true, people })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(await passed(me)).toEqual(['emergency-card', 'first-aid'])
    expect(await rows('SELECT count(*) AS n FROM front_of_house_incidents')).toEqual([{ n: 0 }])
  })
})
