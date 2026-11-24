// Series (SP-20, SP-21, SP-29; rules R1 to R8, A7) and proof P-6: every occurrence checked and listed,
// clashes left out by choice, the whole series saved or nothing, the wall-clock time kept across a
// clock change, cancelling later or all, and a series decided at once.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId, setClock, type Actor } from '#kit'
import { call, person, rows, server } from '../../../../tests/integration/helpers'
import book from '../../server/api/spaces/bookings/index.post'
import checkSeries from '../../server/api/spaces/series/check.post'
import makeSeries from '../../server/api/spaces/series/index.post'
import cancelSeries from '../../server/api/spaces/series/[id]/cancel.post'
import confirmSeries from '../../server/api/spaces/series/[id]/confirm.post'
import declineSeries from '../../server/api/spaces/series/[id]/decline.post'
import { NOV_24, bookable, place, purpose, ready } from './stage'

const app = server({
  'POST /api/spaces/bookings': book,
  'POST /api/spaces/series/check': checkSeries,
  'POST /api/spaces/series': makeSeries,
  'POST /api/spaces/series/:id/cancel': cancelSeries,
  'POST /api/spaces/series/:id/confirm': confirmSeries,
  'POST /api/spaces/series/:id/decline': declineSeries,
})

const member = () => person(['spaces.booking.request'])
const decider = () => person(['spaces.booking.decide'])
const MARCH_1 = Date.UTC(2027, 2, 1, 9)

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const code = (r: { body: any }) => r.body?.code ?? r.body?.data?.code

async function room() {
  const b = await bookable(await place())
  await rows('UPDATE spaces_bookables SET always_open = 1 WHERE id = ?', b.id)
  return b
}
const weekly = (bookableId: string, purposeId: string, first: string, last: string, more: Record<string, unknown> = {}) => ({
  bookableId, purposeId, frequency: 'weekly', weekdays: null, startsLocal: '19:00', lengthMinutes: 120, firstDate: first, lastDate: last,
  title: 'Hamlet rehearsals', notes: null, attendees: null, leaveOut: [], ...more,
})
const states = (seriesId: string) => rows<{ state: string }>('SELECT state FROM spaces_bookings WHERE series_id = ? ORDER BY starts_at', seriesId).then(r => r.map(x => x.state))

beforeAll(ready)

describe('making a series (R1, R2, R4, R5)', () => {
  it('lists every occurrence with its own outcome, and books the rest once a clash is left out', async () => {
    const r = await room()
    const p = await purpose()
    await req(member(), 'POST', '/api/spaces/bookings', { bookableId: r.id, purposeId: p, startsAt: Date.UTC(2027, 0, 12, 19), endsAt: Date.UTC(2027, 0, 12, 20), title: 'Someone else', notes: null, attendees: null })
    const ask = weekly(r.id, p, '2026-12-29', '2027-01-19')
    const checked = (await req(member(), 'POST', '/api/spaces/series/check', ask)).body
    expect(checked.occurrences.map((o: any) => [o.date, o.outcome])).toEqual([['2026-12-29', 'confirm'], ['2027-01-05', 'confirm'], ['2027-01-12', 'refused'], ['2027-01-19', 'confirm']])
    expect(checked.occurrences[2].rule).toBe('C1')

    expect(code(await req(member(), 'POST', '/api/spaces/series', ask))).toBe('spaces.series.clashes')
    const made = await req(member(), 'POST', '/api/spaces/series', { ...ask, leaveOut: ['2027-01-12'] })
    expect(made.body, JSON.stringify(made.body)).toMatchObject({ state: 'confirmed', occurrences: 3 })
    expect(await states(made.body.seriesId)).toEqual(['confirmed', 'confirmed', 'confirmed'])
  })

  it('refuses more occurrences than the limit, and a purpose that may not repeat', async () => {
    const r = await room()
    const p = await purpose()
    await rows('UPDATE spaces_purposes SET may_repeat = 0 WHERE id = ?', p)
    expect(code(await req(member(), 'POST', '/api/spaces/series/check', weekly(r.id, p, '2027-01-05', '2027-01-12')))).toBe('spaces.series.no-repeat')
    const q = await purpose()
    expect(code(await req(member(), 'POST', '/api/spaces/series/check', { ...weekly(r.id, q, '2027-01-05', '2027-01-12'), frequency: 'daily', lastDate: '2027-03-05' }))).toBe('spaces.series.too-many')
  })

  it('P-6: of two overlapping series saved at once, one is saved whole and the other not at all', async () => {
    const r = await room()
    const p = await purpose()
    const results = await Promise.all([
      req(member(), 'POST', '/api/spaces/series', weekly(r.id, p, '2027-01-04', '2027-01-18')),
      req(member(), 'POST', '/api/spaces/series', { ...weekly(r.id, p, '2027-01-04', '2027-01-18'), startsLocal: '20:00' }),
    ])
    expect(results.map(x => x.status).sort()).toEqual([200, 409])
    const counts = await rows<{ series_id: string, n: number }>('SELECT series_id, count(*) AS n FROM spaces_bookings WHERE bookable_id = ? GROUP BY series_id', r.id)
    expect(counts).toHaveLength(1)
    expect(counts[0]!.n).toBe(3)
  })
})

describe('the clock (R3)', () => {
  it('keeps 19:00 as 19:00 across the clock change, and refuses a time the clocks skip', async () => {
    setClock(MARCH_1)
    const r = await room()
    const p = await purpose()
    const made = await req(member(), 'POST', '/api/spaces/series', weekly(r.id, p, '2027-03-23', '2027-03-30'))
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const times = await rows<{ starts_at: number }>('SELECT starts_at FROM spaces_bookings WHERE series_id = ? ORDER BY starts_at', made.body.seriesId)
    expect(times.map(t => t.starts_at)).toEqual([Date.UTC(2027, 2, 23, 19), Date.UTC(2027, 2, 30, 18)])

    const night = (await req(member(), 'POST', '/api/spaces/series/check', { ...weekly(r.id, p, '2027-03-27', '2027-03-29'), frequency: 'daily', startsLocal: '01:30', lengthMinutes: 30 })).body
    expect(night.occurrences.map((o: any) => o.code ?? o.outcome)).toEqual(['confirm', 'spaces.series.no-such-time', 'confirm'])
    setClock(NOV_24)
  })
})

describe('changing a series (R6, R7)', () => {
  it('cancels this and later ones, then all that are left, and ends the series', async () => {
    const r = await room()
    const p = await purpose()
    const who = member()
    const made = (await req(who, 'POST', '/api/spaces/series', weekly(r.id, p, '2026-12-29', '2027-01-19'))).body
    const [, second] = await rows<{ id: string }>('SELECT id FROM spaces_bookings WHERE series_id = ? ORDER BY starts_at', made.seriesId)
    expect((await req(who, 'POST', `/api/spaces/series/${made.seriesId}/cancel`, { from: second!.id })).body).toMatchObject({ cancelled: 3 })
    expect(await states(made.seriesId)).toEqual(['confirmed', 'cancelled', 'cancelled', 'cancelled'])
    expect((await req(who, 'POST', `/api/spaces/series/${made.seriesId}/cancel`, {})).body).toMatchObject({ cancelled: 1 })
    expect(await rows('SELECT state FROM spaces_booking_series WHERE id = ?', made.seriesId)).toEqual([{ state: 'ended' }])
    expect(code(await req(member(), 'POST', `/api/spaces/series/${made.seriesId}/cancel`, {}))).toBe('core.access.denied')
  })
})

describe('deciding a series (A7, SP-29)', () => {
  it('sends a whole series for a decision and confirms or declines it at once', async () => {
    const r = await room()
    const p = await purpose(5, { approval: 'approval' })
    const a = (await req(member(), 'POST', '/api/spaces/series', weekly(r.id, p, '2027-01-05', '2027-01-19'))).body
    expect(a.state).toBe('requested')
    expect((await req(decider(), 'POST', `/api/spaces/series/${a.seriesId}/confirm`, {})).body).toMatchObject({ confirmed: 3 })
    expect(await states(a.seriesId)).toEqual(['confirmed', 'confirmed', 'confirmed'])
    const b = (await req(member(), 'POST', '/api/spaces/series', { ...weekly(r.id, p, '2027-01-05', '2027-01-19'), startsLocal: '10:00' })).body
    expect(code(await req(decider(), 'POST', `/api/spaces/series/${b.seriesId}/decline`, {}))).toBe('spaces.booking.note-needed')
    expect((await req(decider(), 'POST', `/api/spaces/series/${b.seriesId}/decline`, { note: 'Not this term.' })).body).toMatchObject({ declined: 3 })
    expect(await states(b.seriesId)).toEqual(['declined', 'declined', 'declined'])
  })
})
