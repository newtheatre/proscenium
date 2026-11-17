// On the night, FH-19 to FH-26: check-in inside the window and the not-arrived flag; timings once
// each, replaced and audited, with the optional house-open block; extending tonight; checklists from
// set-up through entries, exceptions and completion to a late entry being refused; the emergency
// card; and contributed figures that fail or are slow showing as unavailable.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { listTerms } from '#modules/core'
import { readFigure } from '../../server/night'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { duty, performance, ready, req, setting, shift, shiftRow, volunteer, MINUTE } from './stage'

beforeAll(ready)
afterEach(() => setClock(undefined))

const HOUR = 60 * MINUTE
const steward = (): ReturnType<typeof volunteer> => person(['front-of-house.shift.sign-up', 'front-of-house.shift.view', 'front-of-house.checklist.complete', 'front-of-house.emergency-card.view'])

async function onShift() {
  const p = await performance()
  const id = await shift(p.id, await duty('Steward'), 3)
  const amy = steward()
  const ben = steward()
  const a = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, amy)).body.assignmentId as string
  const b = (await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ben)).body.assignmentId as string
  const row = await shiftRow(id)
  return { p, id, amy, ben, a, b, callAt: row.call_at as number, opensAt: row.window_opens_at as number, closesAt: row.window_closes_at as number }
}

async function checklist(moment: 'pre-show' | 'post-show' = 'pre-show') {
  const made = await req('POST', '/api/front-of-house/checklists', {
    name: `Doors ${Math.random()}`.slice(0, 20),
    moment,
    items: [{ label: 'Fire exits clear' }, { label: 'Fridge temperature', kind: 'reading', unit: '°C' }, { label: 'Spare programmes', required: false }],
  })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const listed = (await req('GET', '/api/front-of-house/checklists')).body.checklists.find((c: any) => c.id === made.body.checklistId)
  return { id: made.body.checklistId as string, items: listed.items as { id: string, label: string }[] }
}

const reason = async (slug: string) => (await inContext(() => listTerms('front-of-house.exception-reason'))).find(t => t.slug === slug)!.id

describe('FH-21: check-in', () => {
  it('lets a person check themselves in only inside the window, and keeps the first time', async () => {
    const s = await onShift()
    setClock(s.opensAt - MINUTE)
    expect((await req('POST', `/api/front-of-house/assignments/${s.a}/check-in`, {}, s.amy)).body.code).toBe('front-of-house.outside-window')
    setClock(s.opensAt + MINUTE)
    expect((await req('POST', `/api/front-of-house/assignments/${s.a}/check-in`, {}, s.amy)).status).toBe(200)
    setClock(s.opensAt + 5 * MINUTE)
    expect((await req('POST', `/api/front-of-house/assignments/${s.a}/check-in`, {}, s.amy)).status).toBe(200)
    expect(await rows('SELECT state, checked_in_at FROM front_of_house_assignments WHERE id = ?', s.a)).toEqual([{ state: 'checked_in', checked_in_at: s.opensAt + MINUTE }])
    setClock(s.closesAt + MINUTE)
    expect((await req('POST', `/api/front-of-house/assignments/${s.b}/check-in`, {}, s.ben)).body.code).toBe('front-of-house.shift-ended')
  })

  it('lets a lead mark someone else arrived, and no one else', async () => {
    const s = await onShift()
    setClock(s.callAt)
    expect((await req('POST', `/api/front-of-house/assignments/${s.b}/check-in`, {}, s.amy)).status).toBe(403)
    const lead = person(['front-of-house.assignment.check-in'])
    expect((await req('POST', `/api/front-of-house/assignments/${s.b}/check-in`, {}, lead)).status).toBe(200)
  })

  it('flags people not arrived on the board once the late setting has passed', async () => {
    const s = await onShift()
    setClock(s.callAt)
    await req('POST', `/api/front-of-house/assignments/${s.a}/check-in`, {}, s.amy)
    const early = (await req('GET', `/api/front-of-house/performances/${s.p.id}/tonight`, undefined, s.amy)).body
    expect(early.shifts[0].people.map((x: any) => x.notArrived)).toEqual([false, false])
    setClock(s.callAt + 31 * MINUTE)
    const board = await req('GET', `/api/front-of-house/performances/${s.p.id}/tonight`, undefined, s.amy)
    expect(board.status, JSON.stringify(board.body)).toBe(200)
    expect(board.body.shifts[0].people.map((x: any) => [x.assignmentId, x.state, x.notArrived])).toEqual([[s.a, 'checked_in', false], [s.b, 'confirmed', true]])
    expect(board.body.figures).toEqual([])
  })
})

describe('FH-22: timings', () => {
  it('records each timing once, replaces it on a second tap, and audits the change', async () => {
    const s = await onShift()
    setClock(s.p.startsAt - 30 * MINUTE)
    expect((await req('POST', `/api/front-of-house/performances/${s.p.id}/timings`, { kind: 'house_open' })).status).toBe(200)
    expect((await req('POST', `/api/front-of-house/performances/${s.p.id}/timings`, { kind: 'house_open', at: s.p.startsAt - 25 * MINUTE })).status).toBe(200)
    expect(await rows('SELECT kind, at FROM front_of_house_timings WHERE performance_id = ?', s.p.id)).toEqual([{ kind: 'house_open', at: s.p.startsAt - 25 * MINUTE }])
    expect((await req('POST', `/api/front-of-house/performances/${s.p.id}/timings`, { kind: 'curtain_up', at: s.p.startsAt + 2 * HOUR })).body.code).toBe('front-of-house.timing-too-far')
    // Someone on shift who is not leading cannot record one.
    expect((await req('POST', `/api/front-of-house/performances/${s.p.id}/timings`, { kind: 'curtain_up' }, s.amy)).status).toBe(403)
    expect((await rows('SELECT id FROM core_audit WHERE record_id = ? AND action = \'update\'', s.p.id)).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the house closed while a pre-show checklist is open, when the theatre asks', async () => {
    const s = await onShift()
    const c = await checklist('pre-show')
    setClock(s.callAt)
    await req('POST', `/api/front-of-house/performances/${s.p.id}/checklists/${c.id}/open`, {}, s.amy)
    await setting('front-of-house.checklists.block-house-open', true)
    try {
      expect((await req('POST', `/api/front-of-house/performances/${s.p.id}/timings`, { kind: 'house_open' })).body.code).toBe('front-of-house.checklists-open')
      expect((await req('POST', `/api/front-of-house/performances/${s.p.id}/timings`, { kind: 'curtain_up' })).status).toBe(200)
    }
    finally {
      await setting('front-of-house.checklists.block-house-open', false)
    }
    expect((await req('POST', `/api/front-of-house/performances/${s.p.id}/timings`, { kind: 'house_open' })).status).toBe(200)
  })
})

describe('FH-23: extend tonight', () => {
  it('closes every window half an hour later, at most six hours past the end, never earlier', async () => {
    const s = await onShift()
    setClock(s.callAt)
    const extended = await req('POST', `/api/front-of-house/performances/${s.p.id}/extend`, {})
    expect(extended.body).toEqual({ closesAt: s.closesAt + 30 * MINUTE })
    expect((await shiftRow(s.id)).window_closes_at).toBe(s.closesAt + 30 * MINUTE)
    const endsAt = (await shiftRow(s.id)).ends_at as number
    for (let i = 0; i < 12; i++) await req('POST', `/api/front-of-house/performances/${s.p.id}/extend`, {})
    expect((await shiftRow(s.id)).window_closes_at).toBe(Math.max(s.closesAt, endsAt + 6 * HOUR))
    // The extension keeps the person on shift.
    setClock(s.closesAt + 10 * MINUTE)
    expect((await req('POST', `/api/front-of-house/assignments/${s.a}/check-in`, {}, s.amy)).status).toBe(200)
  })
})

describe('FH-24 and FH-25: checklists', () => {
  it('edits a checklist, archiving the items left out', async () => {
    const c = await checklist()
    const [exits, , spare] = c.items
    const put = await req('PUT', `/api/front-of-house/checklists/${c.id}`, { name: 'Doors', moment: 'pre-show', items: [{ id: spare!.id, label: 'Spare programmes', required: false }, { id: exits!.id, label: 'All fire exits clear' }, { label: 'Toilets stocked' }] })
    expect(put.status, JSON.stringify(put.body)).toBe(200)
    const listed = (await req('GET', '/api/front-of-house/checklists')).body.checklists.find((x: any) => x.id === c.id)
    expect(listed.items.map((i: any) => i.label)).toEqual(['Spare programmes', 'All fire exits clear', 'Toilets stocked'])
    expect((await req('POST', `/api/front-of-house/checklists/${c.id}/archive`, {})).status).toBe(200)
  })

  it('works through a run: entries, an exception with its reason, completion, and a late entry refused', async () => {
    const s = await onShift()
    const c = await checklist()
    const [exits, fridge] = c.items
    setClock(s.callAt)
    const before = await req('GET', `/api/front-of-house/performances/${s.p.id}/checklists/${c.id}`, undefined, s.amy)
    expect(before.body).toMatchObject({ runId: null, state: 'not_started' })
    const path = `/api/front-of-house/performances/${s.p.id}/checklists/${c.id}`
    expect((await req('PUT', `${path}/items/${exits!.id}`, { outcome: 'done' }, s.amy)).status).toBe(200)
    expect((await req('POST', `${path}/complete`, {}, s.amy)).body.code).toBe('front-of-house.checklist-incomplete')
    expect((await req('PUT', `${path}/items/${fridge!.id}`, { outcome: 'done' }, s.amy)).body.code).toBe('front-of-house.reading-needed')
    expect((await req('PUT', `${path}/items/${fridge!.id}`, { outcome: 'exception' }, s.amy)).body.code).toBe('front-of-house.reason-needed')
    const broken = await req('PUT', `${path}/items/${fridge!.id}`, { outcome: 'exception', reasonCode: await reason('broken'), reasonNote: 'Thermometer missing', doneAt: s.callAt - MINUTE }, s.ben)
    expect(broken.status, JSON.stringify(broken.body)).toBe(200)
    const progress = (await req('GET', `/api/front-of-house/performances/${s.p.id}/tonight`, undefined, s.amy)).body.checklists.find((x: any) => x.checklistId === c.id)
    expect(progress).toMatchObject({ state: 'open', entered: 2, required: 2, exceptions: 1 })
    const done = await req('POST', `${path}/complete`, {}, s.amy)
    expect(done.body).toEqual({ state: 'complete_with_exceptions' })
    expect(await rows('SELECT id FROM core_events WHERE name = \'front-of-house.checklist-run.completed\' AND record_id = ?', before.body.runId ?? (await rows<{ id: string }>('SELECT id FROM front_of_house_checklist_runs WHERE checklist_id = ?', c.id))[0]!.id)).toHaveLength(1)
    // A queued entry arriving after completion is refused, so the phone shows it as stuck.
    expect((await req('PUT', `${path}/items/${fridge!.id}`, { outcome: 'done', reading: 4 }, s.ben)).body.code).toBe('front-of-house.checklist-run-complete')
    // Someone leading reopens it; a steward cannot.
    expect((await req('POST', `${path}/reopen`, {}, s.amy)).status).toBe(403)
    expect((await req('POST', `${path}/reopen`, {})).status).toBe(200)
    expect((await req('PUT', `${path}/items/${fridge!.id}`, { outcome: 'done', reading: 4 }, s.ben)).status).toBe(200)
    expect((await req('POST', `${path}/complete`, {}, s.amy)).body).toEqual({ state: 'complete' })
    const run = await req('GET', path, undefined, s.amy)
    expect(run.body.items.map((i: any) => i.entry?.outcome ?? null)).toEqual(['done', 'done', null])
    // Once the night is signed off its checklists are final.
    const signer = person(['front-of-house.night-report.sign-off'])
    expect((await req('POST', `/api/front-of-house/performances/${s.p.id}/report/sign-off`, { noShows: [] }, signer)).status).toBe(200)
    expect((await req('POST', `${path}/reopen`, {})).body.code).toBe('front-of-house.report-signed-off')
  })

  it('keeps a run to the items it started with', async () => {
    const s = await onShift()
    const c = await checklist()
    setClock(s.callAt)
    await req('POST', `/api/front-of-house/performances/${s.p.id}/checklists/${c.id}/open`, {}, s.amy)
    setClock(s.callAt + MINUTE)
    await req('PUT', `/api/front-of-house/checklists/${c.id}`, { name: 'Doors', moment: 'pre-show', items: [...c.items.map(i => ({ id: i.id, label: i.label })), { label: 'Added later' }] })
    const run = await req('GET', `/api/front-of-house/performances/${s.p.id}/checklists/${c.id}`, undefined, s.amy)
    expect(run.body.items).toHaveLength(3)
  })
})

describe('FH-26: the emergency card', () => {
  it('is written by a manager, marked reviewed only when ticked, and read by anyone rostered', async () => {
    const p = await performance()
    const saved = await req('PUT', `/api/front-of-house/emergency-cards/${p.venueId}`, { body: 'Leave by the nearest exit. Assemble on the green.' })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const cards = (await req('GET', '/api/front-of-house/emergency-cards', undefined, steward())).body.cards
    expect(cards.find((c: any) => c.venueId === p.venueId)).toMatchObject({ body: 'Leave by the nearest exit. Assemble on the green.', reviewedOn: '2026-11-16' })
    // A later fix without the review tick leaves the date; with it, the date moves.
    setClock(Date.UTC(2026, 11, 1, 12))
    await req('PUT', `/api/front-of-house/emergency-cards/${p.venueId}`, { body: 'Leave by the nearest exit. Assemble on the village green.' })
    expect((await rows('SELECT reviewed_on FROM front_of_house_emergency_cards WHERE venue_id = ?', p.venueId))[0]).toEqual({ reviewed_on: '2026-11-16' })
    await req('PUT', `/api/front-of-house/emergency-cards/${p.venueId}`, { body: 'Leave by the nearest exit. Assemble on the village green.', reviewed: true })
    expect((await rows('SELECT reviewed_on FROM front_of_house_emergency_cards WHERE venue_id = ?', p.venueId))[0]).toEqual({ reviewed_on: '2026-12-01' })
    expect((await req('PUT', '/api/front-of-house/emergency-cards/nowhere', { body: 'x' })).body.code).toBe('core.not-found')
    expect((await req('GET', '/api/front-of-house/emergency-cards', undefined, volunteer())).status).toBe(403)
  })
})

describe('FH-20: contributed figures', () => {
  it('shows a figure that throws or is slow as unavailable', async () => {
    const figure = (read: () => Promise<any>) => ({ label: 'x', ability: 'front-of-house.shift.view', read })
    expect(await readFigure(figure(async () => ({ value: 120, state: 'ok' })), 'p')).toEqual({ value: 120, state: 'ok' })
    expect(await readFigure(figure(async () => { throw new Error('down') }), 'p')).toEqual({ value: null, state: 'unavailable' })
    expect(await readFigure(figure(() => new Promise(() => {})), 'p')).toEqual({ value: null, state: 'unavailable' })
  })
})
