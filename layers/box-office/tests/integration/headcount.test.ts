// The door counter (BO-73): presses stored once however often they are sent, a full house that never
// refuses, Out only where it is offered, undo within the window and a supervisor's correction after.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { listTerms } from '#modules/core'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import attendance from '../../server/contributions/front-of-house.report-section/attendance'
import { headcountFor } from '../../server/headcount'
import { house, NOV_16, ready, req } from './stage'

const steward = person(['box-office.ticket.admit'])
const supervisor = person(['box-office.headcount.correct'])
const ALPHABET = '234567abcdefghijklmnopqrstuvwxyz'
const tapId = () => `hct_${Array.from(crypto.getRandomValues(new Uint8Array(26)), b => ALPHABET[b % 32]).join('')}`

const press = (performanceId: string, items: unknown[], actor = steward) => req('POST', `/api/box-office/performances/${performanceId}/headcount/taps`, { items, deviceLabel: 'Front door' }, actor)
const tap = (kind: 'in' | 'out', quantity = 1, at = Date.now()) => ({ kind, id: tapId(), quantity, at })

async function setting(key: string, value: unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
})

afterEach(async () => {
  await setting('box-office.door.count-out', false)
})

describe('the door counter (BO-73)', () => {
  it('headcount-tap-once: the same device-made id sent twice stores one press', async () => {
    const h = await house(4, { houseCapacity: 100 })
    const one = tap('in', 4)
    const first = await press(h.performanceId, [one])
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.results).toEqual([{ id: one.id, result: 'counted' }])
    // Sent again from the device's offline queue after the answer was lost.
    const again = await press(h.performanceId, [one, tap('in', 2)])
    expect(again.body.results[0]).toEqual({ id: one.id, result: 'sent' })
    expect(again.body.headcount).toMatchObject({ in: 6, walkUps: 6, inside: 6, admitted: 0, capacity: 100 })
    expect(await rows('SELECT count(*) AS n FROM box_office_headcount_taps WHERE performance_id = ?', h.performanceId)).toEqual([{ n: 2 }])
  })

  it('headcount-never-refuses-at-capacity: presses past capacity are stored, and full is announced once', async () => {
    const h = await house(4, { houseCapacity: 10 })
    expect((await press(h.performanceId, [tap('in', 8)])).body.headcount.inside).toBe(8)
    const over = await press(h.performanceId, [tap('in', 4)])
    expect(over.body.results[0].result).toBe('counted')
    expect(over.body.headcount).toMatchObject({ inside: 12, capacity: 10 })
    await press(h.performanceId, [tap('in', 1)])
    expect(await rows('SELECT payload FROM core_events WHERE name = \'box-office.headcount.full\' AND record_id = ?', h.performanceId)).toHaveLength(1)
    const view = await req('GET', `/api/box-office/performances/${h.performanceId}/headcount`, undefined, steward)
    expect(view.body).toMatchObject({ headcount: { inside: 13 }, fullWarning: 90, countsOut: false })
  })

  it('offers Out only once the setting is on (HC3)', async () => {
    const h = await house(4)
    expect((await press(h.performanceId, [tap('in', 3), tap('out', 1)])).body.results.map((r: { result: string }) => r.result)).toEqual(['counted', 'out-not-offered'])
    await setting('box-office.door.count-out', true)
    const out = await press(h.performanceId, [tap('out', 2)])
    expect(out.body.headcount).toMatchObject({ in: 3, out: 2, inside: 1, peak: 3 })
  })

  it('undoes a press within the window, once, and leaves an older one to a supervisor with a reason (HC5)', async () => {
    const h = await house(4)
    const now = Date.now()
    const early = tap('in', 5, now)
    const late = tap('in', 2, now + 1000)
    await press(h.performanceId, [early, late])
    const undo = (reversesId: string, at: number) => ({ kind: 'undo', id: tapId(), reversesId, at })
    const undone = await press(h.performanceId, [undo(late.id, now + 30_000)])
    expect(undone.body.results[0].result).toBe('counted')
    expect(undone.body.headcount.inside).toBe(5)
    expect((await press(h.performanceId, [undo(late.id, now + 40_000)])).body.results[0].result).toBe('already-undone')
    expect((await press(h.performanceId, [undo(early.id, now + 5 * 60_000)])).body.results[0].result).toBe('too-late')

    const reason = (await inContext(() => listTerms('box-office.headcount-correction'))).find(t => t.slug === 'counted-twice')!.id
    const correct = (actor: ReturnType<typeof person>) => req('POST', `/api/box-office/performances/${h.performanceId}/headcount/correct`, { id: tapId(), reversesId: early.id, reasonTermId: reason }, actor)
    expect((await correct(steward)).status).toBe(403)
    advanceClock(60_000)
    const corrected = await correct(supervisor)
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200)
    expect(corrected.body.headcount.inside).toBe(0)
    expect(await rows('SELECT reason_term_id FROM box_office_headcount_taps WHERE reverses_id = ?', early.id)).toEqual([{ reason_term_id: reason }])
    expect((await correct(supervisor)).body.code).toBe('box-office.headcount.already-undone')
  })

  it('answers as a set, and the night report shows walk-ups and peak inside beside admitted', async () => {
    const a = await house(4)
    const b = await house(4)
    await press(a.performanceId, [tap('in', 7)])
    const figures = await inContext(() => headcountFor([a.performanceId, b.performanceId]), steward)
    expect(figures[a.performanceId]).toMatchObject({ walkUps: 7, admitted: 0 })
    expect(figures[b.performanceId]).toMatchObject({ in: 0, inside: 0, peak: 0 })
    const lines = await inContext(() => attendance.compile(a.performanceId), steward)
    expect(lines).toEqual(expect.arrayContaining([{ label: 'box-office.report.walk-ups', value: 7 }, { label: 'box-office.report.peak-inside', value: 7 }]))
    expect((await inContext(() => attendance.compile(b.performanceId), steward)).some(l => l.label === 'box-office.report.walk-ups')).toBe(false)
  })
})
