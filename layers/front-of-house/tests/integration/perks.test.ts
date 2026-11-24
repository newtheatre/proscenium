// T-shirts and meals (FH-50): earned per CC3 and counted when asked (CC4), handed out once (HO1,
// test plan's handout-once), handed early with a warning (HO2), undone by a reversing row, and
// dietary needs counted for managers but named only under crew-call.view-needs.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, type Actor } from '#kit'
import { addResponse } from '#modules/forms'
import { SHIPPED_TEMPLATES } from '../../../forms/shared/templates'
import { inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import { OPEN, account, form, publish, ready as formsReady, req as forms } from '../../../forms/tests/integration/stage'
import { duty, ready, req, volunteer, type Person } from './stage'

const SLOT = 'front-of-house.crew-call'
const CREW = ['front-of-house.crew-call.manage', 'front-of-house.handout.record', 'front-of-house.shift.manage', 'front-of-house.duty.manage']
const cal = person(CREW, { name: 'Cal Crew' })
const dee = person([...CREW, 'front-of-house.crew-call.view-needs'], { name: 'Dee Diet' })
const actorOf = (who: Person): Actor => ({ kind: 'person', accountId: who.accountId, grants: [] } as unknown as Actor)
const crewSignUp = SHIPPED_TEMPLATES.find(t => t.key === 'forms.crew-sign-up')!.definition
const THURSDAY = '2027-02-11'

beforeAll(async () => {
  await formsReady()
  await ready()
  await setModule('forms', true)
  for (const who of [cal, dee]) await account(who)
})

/** An open call from Wednesday 10 to Sunday 14 February 2027, its crew questions, and one Thursday shift. */
async function festival(): Promise<{ callId: string, formId: string, shiftId: string }> {
  const made = await req('POST', '/api/front-of-house/crew-calls', { name: `Perks crew ${newId('tst').slice(-8)}`, startsOn: '2027-02-10', endsOn: '2027-02-14', tshirtMinShifts: 1, mealMinMinutes: 240 }, cal)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const callId = made.body.crewCallId
  const formId = await form('Crew questions')
  expect((await forms('PATCH', `/api/forms/forms/${formId}`, { retentionDays: 180 })).status).toBe(200)
  expect((await publish(formId, crewSignUp)).status).toBe(200)
  expect((await forms('PUT', `/api/forms/slots/${SLOT}/${callId}/${formId}`, { ...OPEN, audience: 'signed_in', onePerPerson: true }, cal)).status).toBe(200)
  expect((await req('POST', `/api/front-of-house/crew-calls/${callId}/state`, { to: 'open' }, cal)).status).toBe(200)
  const callAt = Date.UTC(2027, 1, 11, 9)
  const shift = await req('POST', '/api/front-of-house/shifts', { title: 'Festival front of house', dutyId: await duty('Steward'), places: 5, callAt, endsAt: callAt + 4 * 3600_000, crewCallId: callId })
  expect((await req('POST', `/api/front-of-house/shifts/${shift.body.shiftId}/publish`, {})).status).toBe(200)
  return { callId, formId, shiftId: shift.body.shiftId }
}

async function crew(f: { callId: string, formId: string, shiftId: string }, answers: Record<string, unknown>): Promise<Person> {
  const who = volunteer()
  await account(who)
  await inContext(async () => {
    const unit = createUnit()
    await addResponse(unit.view(), { slot: SLOT, subject: f.callId, formId: f.formId, actor: actorOf(who), answers })
    await unit.commit()
  }, actorOf(who))
  expect((await req('POST', `/api/front-of-house/shifts/${f.shiftId}/sign-up`, {}, who)).body.state).toBe('confirmed')
  return who
}

const hand = (callId: string, body: Record<string, unknown>, by: Person = cal) => req('POST', `/api/front-of-house/crew-calls/${callId}/handouts`, body, by)

describe('perks counts', () => {
  it('counts T-shirts by size and meals by day, hiding needs fewer than three people share', async () => {
    const f = await festival()
    await crew(f, { 't-shirt': 'm', 'meal-days': ['thursday'], 'dietary': ['vegan'] })
    await crew(f, { 't-shirt': 'l', 'meal-days': ['wednesday'], 'dietary': ['vegan'] })
    await crew(f, { 't-shirt': 'm', 'meal-days': ['thursday', 'friday'] })
    const counts = (await req('GET', `/api/front-of-house/crew-calls/${f.callId}/perks`, undefined, cal)).body
    expect(counts.tshirts).toEqual([{ size: 'L', earned: 1, handed: 0, toHand: 1 }, { size: 'M', earned: 2, handed: 0, toHand: 2 }])
    expect(counts.meals.find((m: { day: string }) => m.day === THURSDAY)).toEqual({ day: THURSDAY, earned: 2, handed: 0, needs: [{ need: 'Vegan', count: null }] })
    expect(counts.meals.find((m: { day: string }) => m.day === '2027-02-10')).toMatchObject({ earned: 0 })
    expect(counts.roles).toEqual({ tshirtSize: 't_shirt', mealDays: 'meal_days', dietaryNeed: 'dietary' })
  })

  it('names dietary needs only for crew-call.view-needs, and audits the list', async () => {
    const f = await festival()
    const ann = await crew(f, { 't-shirt': 's', 'meal-days': ['thursday'], 'dietary': ['gluten-free'] })
    const plain = await req('GET', `/api/front-of-house/crew-calls/${f.callId}/perks/people`, undefined, cal)
    expect(plain.body.needs).toBe(false)
    expect(plain.body.people).toMatchObject([{ accountId: ann.accountId, tshirt: true, size: 'S', mealDays: [THURSDAY], needs: [] }])
    const named = await req('GET', `/api/front-of-house/crew-calls/${f.callId}/perks/people`, undefined, dee)
    expect(named.body.people).toMatchObject([{ accountId: ann.accountId, needs: ['Gluten free'] }])
    expect(await rows('SELECT id FROM core_audit WHERE action = \'read\' AND record_id = ?', f.callId)).toHaveLength(2)
  })
})

describe('handouts', () => {
  it('handout-once: two at once give one row and one refusal; a later one names who', async () => {
    const f = await festival()
    const ann = await crew(f, { 't-shirt': 'm', 'meal-days': ['thursday'] })
    const both = await Promise.all([hand(f.callId, { accountId: ann.accountId, item: 'tshirt' }), hand(f.callId, { accountId: ann.accountId, item: 'tshirt' }, dee)])
    expect(both.map(r => r.status).sort()).toEqual([200, 409])
    expect(both.find(r => r.status !== 200)!.body.code).toBe('front-of-house.handout.already')
    expect(await rows('SELECT id FROM front_of_house_handouts WHERE crew_call_id = ? AND account_id = ?', f.callId, ann.accountId)).toHaveLength(1)
    const again = await hand(f.callId, { accountId: ann.accountId, item: 'tshirt' })
    expect(again.body.code).toBe('front-of-house.handout.already')
    expect(again.body.reason).toMatch(/^Already handed out by (Cal Crew|Dee Diet) at \d\d:\d\d\.$/)
    const counts = (await req('GET', `/api/front-of-house/crew-calls/${f.callId}/perks`, undefined, cal)).body
    expect(counts.tshirts).toEqual([{ size: 'M', earned: 1, handed: 1, toHand: 0 }])
  })

  it('records a handout not yet earned with a warning, and undoes by a reversing row', async () => {
    const f = await festival()
    const bob = await crew(f, { 't-shirt': 'l', 'meal-days': ['wednesday'] })
    const early = await hand(f.callId, { accountId: bob.accountId, item: 'meal', day: THURSDAY })
    expect(early.body).toMatchObject({ earned: false })
    expect((await req('GET', `/api/front-of-house/crew-calls/${f.callId}/perks`, undefined, cal)).body).toMatchObject({ mealsEarly: 1 })
    const undo = await req('POST', `/api/front-of-house/crew-calls/${f.callId}/handouts/${early.body.handoutId}/undo`, {}, cal)
    expect(undo.status, JSON.stringify(undo.body)).toBe(200)
    expect((await req('POST', `/api/front-of-house/crew-calls/${f.callId}/handouts/${early.body.handoutId}/undo`, {}, cal)).body.code).toBe('front-of-house.handout.already-undone')
    expect(await rows('SELECT reverses_id FROM front_of_house_handouts WHERE account_id = ? ORDER BY created_at, id', bob.accountId)).toEqual([{ reverses_id: null }, { reverses_id: early.body.handoutId }])
    // Undone, it can be handed out again; a meal needs one of the call's days.
    expect((await hand(f.callId, { accountId: bob.accountId, item: 'meal', day: THURSDAY })).status).toBe(200)
    expect((await hand(f.callId, { accountId: bob.accountId, item: 'meal', day: '2027-03-01' })).status).toBe(422)
    // The rows are append-only.
    await expect(rows('DELETE FROM front_of_house_handouts WHERE account_id = ?', bob.accountId)).rejects.toThrow(/append-only/)
  })

  it('refuses a handout to yourself', async () => {
    const f = await festival()
    expect((await hand(f.callId, { accountId: cal.accountId, item: 'tshirt' })).body.code).toBe('core.access.own-record')
  })
})
