// Crew calls and their sign-up questions (FH-49): CC1 refuses a volunteer's sign-up until they have
// answered, and only warns a manager who assigns them; CC2's one response each is the form's; shifts
// for the season's performances join the call; and the call moves through its four states.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, type Actor } from '#kit'
import { addResponse } from '#modules/forms'
import { inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import { OPEN, account, definition, form, publish, question, ready as formsReady, req as forms } from '../../../forms/tests/integration/stage'
import { duty, performance, ready, req, shift, shiftRow, volunteer, type Person } from './stage'

const SLOT = 'front-of-house.crew-call'
const crewManager = person(['front-of-house.crew-call.manage', 'front-of-house.shift.manage', 'front-of-house.duty.manage', 'core.production.create', 'core.performance.schedule', 'core.venue.manage'], { name: 'Cal Crew' })
const actorOf = (who: Person): Actor => ({ kind: 'person', accountId: who.accountId, grants: [] } as unknown as Actor)

beforeAll(async () => {
  await formsReady()
  await ready()
  await setModule('forms', true)
  await account(crewManager)
})

let calls = 0
async function crewCall(more: Record<string, unknown> = {}): Promise<string> {
  const made = await req('POST', '/api/front-of-house/crew-calls', { name: `StuFF crew ${++calls} ${newId('tst').slice(-6)}`, startsOn: '2027-02-10', endsOn: '2027-02-14', ...more }, crewManager)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.crewCallId
}

/** The crew sign-up questions, published and attached to the call. */
async function questions(callId: string): Promise<string> {
  const formId = await form('Crew questions')
  expect((await forms('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 180 })).status).toBe(200)
  const done = await publish(formId, definition(question('size', { required: true })))
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  const put = await forms('PUT', `/api/forms/slots/${SLOT}/${callId}/${formId}`, { ...OPEN, audience: 'signed_in', onePerPerson: true }, crewManager)
  expect(put.status, JSON.stringify(put.body)).toBe(200)
  return formId
}

async function answer(who: Person, callId: string, formId: string): Promise<void> {
  await account(who)
  await inContext(async () => {
    const unit = createUnit()
    await addResponse(unit.view(), { slot: SLOT, subject: callId, formId, actor: actorOf(who), answers: { size: 'M' } })
    await unit.commit()
  }, actorOf(who))
}

/** A published shift of the call, not tied to a performance. */
async function callShift(callId: string): Promise<string> {
  const callAt = Date.UTC(2027, 1, 11, 9)
  const made = await req('POST', '/api/front-of-house/shifts', { title: 'Festival box office', dutyId: await duty('Box office'), places: 3, callAt, endsAt: callAt + 4 * 3600_000, crewCallId: callId })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  expect((await req('POST', `/api/front-of-house/shifts/${made.body.shiftId}/publish`, {})).status).toBe(200)
  return made.body.shiftId
}

describe('crew-questions-before-sign-up', () => {
  it('refuses a volunteer until they have answered, and lets them on once they have', async () => {
    const callId = await crewCall()
    const formId = await questions(callId)
    expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'open' }, crewManager)).status).toBe(200)
    const shiftId = await callShift(callId)
    const vic = volunteer()

    const refused = await req('POST', `/api/front-of-house/shifts/${shiftId}/sign-up`, {}, vic)
    expect(refused.body.code).toBe('front-of-house.crew-call.questions-first')
    expect(refused.body.remedy).toBe('Answer the crew questions first, then sign up.')
    expect((await req('GET', `/api/front-of-house/shifts/${shiftId}`, undefined, vic)).body.questionsFirst).toMatchObject({ crewCallId: callId })
    expect((await req('GET', `/api/front-of-house/crew-calls/${callId}/mine`, undefined, vic)).body).toMatchObject({ questions: true, answered: false })

    await answer(vic, callId, formId)
    expect((await req('GET', `/api/front-of-house/crew-calls/${callId}/mine`, undefined, vic)).body).toMatchObject({ answered: true })
    expect((await req('GET', `/api/front-of-house/shifts/${shiftId}`, undefined, vic)).body.questionsFirst).toBeNull()
    expect((await req('POST', `/api/front-of-house/shifts/${shiftId}/sign-up`, {}, vic)).body.state).toBe('confirmed')

    const view = await req('GET', `/api/front-of-house/crew-calls/${callId}`, undefined, crewManager)
    expect(view.body).toMatchObject({ shifts: 1, crew: 1, questions: true })
    expect(view.body.crewList).toMatchObject([{ accountId: vic.accountId, shifts: 1, minutes: 240, answered: true }])
  })

  it('only warns a manager who assigns someone who has not answered', async () => {
    const callId = await crewCall()
    await questions(callId)
    expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'open' }, crewManager)).status).toBe(200)
    const shiftId = await callShift(callId)
    const ned = volunteer()
    const assigned = await req('POST', `/api/front-of-house/shifts/${shiftId}/assign`, { accountId: ned.accountId })
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)
    expect(assigned.body.crewQuestions).toMatchObject({ crewCallId: callId })
    const view = await req('GET', `/api/front-of-house/crew-calls/${callId}`, undefined, crewManager)
    expect(view.body.crewList).toMatchObject([{ accountId: ned.accountId, answered: false }])
  })

  it('asks nothing of a call with no questions, nor once the call has closed', async () => {
    const plain = await crewCall()
    expect((await req('POST', `/api/front-of-house/shifts/${await callShift(plain)}/sign-up`, {}, volunteer())).body.state).toBe('confirmed')

    const callId = await crewCall()
    await questions(callId)
    expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'open' }, crewManager)).status).toBe(200)
    expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'closed' }, crewManager)).status).toBe(200)
    expect((await req('POST', `/api/front-of-house/shifts/${await callShift(callId)}/sign-up`, {}, volunteer())).body.state).toBe('confirmed')
  })
})

describe('crew calls', () => {
  it('joins shifts for the season\'s performances, made before the call or after it', async () => {
    const seasonId = newId('sea')
    await rows('INSERT INTO core_seasons (id, slug, name, starts_on, ends_on, state, created_at) VALUES (?, ?, ?, \'2027-01-01\', \'2027-12-31\', \'published\', 0)', seasonId, seasonId.toLowerCase().replace('_', '-'), `Festival ${seasonId}`)
    const inSeason = async () => {
      const p = await performance()
      await rows('UPDATE core_productions SET season_id = ? WHERE id = (SELECT production_id FROM core_performances WHERE id = ?)', seasonId, p.id)
      return p
    }
    const before = await inSeason()
    const early = await shift(before.id, await duty('Steward'))
    const callId = await crewCall({ seasonId })
    expect((await shiftRow(early)).crew_call_id).toBe(callId)
    const after = await inSeason()
    const late = await shift(after.id, await duty('Steward'))
    expect(await shiftRow(late)).toMatchObject({ crew_call_id: callId, space_id: after.spaceId })
    const elsewhere = await shift((await performance()).id, await duty('Steward'))
    expect((await shiftRow(elsewhere)).crew_call_id).toBeNull()
  })

  it('keeps names unique among calls not archived, and moves only as the lifecycle allows', async () => {
    const callId = await crewCall({ name: 'Unique crew name' })
    expect((await req('POST', '/api/front-of-house/crew-calls', { name: 'Unique crew name', startsOn: '2027-03-01', endsOn: '2027-03-02' }, crewManager)).body.code).toBe('front-of-house.crew-call.name-taken')
    expect((await req('POST', '/api/front-of-house/crew-calls', { name: 'Backwards', startsOn: '2027-03-02', endsOn: '2027-03-01' }, crewManager)).status).toBe(422)
    expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'closed' }, crewManager)).body.code).toBe('front-of-house.crew-call.cannot-move')
    expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'open' }, crewManager)).status).toBe(200)
    expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'closed' }, crewManager)).status).toBe(200)
    // The festival is in February 2027 and the clock is in November 2026.
    expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'archived' }, crewManager)).body.code).toBe('front-of-house.crew-call.not-ended')
    const patched = await req('PATCH', `/api/front-of-house/crew-calls/${callId}`, { tshirtMinShifts: 3, mealMinMinutes: 240 }, crewManager)
    expect(patched.status, JSON.stringify(patched.body)).toBe(200)
    expect((await req('GET', '/api/front-of-house/crew-calls', undefined, crewManager)).body.calls.find((c: { id: string }) => c.id === callId)).toMatchObject({ tshirtMinShifts: 3, mealMinMinutes: 240, state: 'closed' })
    expect((await req('GET', '/api/front-of-house/crew-calls', undefined, volunteer())).status).toBe(403)
  })
})
