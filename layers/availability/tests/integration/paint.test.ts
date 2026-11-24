// Painting on My availability (AV-04, T-AV-05): a stroke written for the day or into the pattern,
// and clear taking back what was painted without disturbing which entry wins (A4).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock, type Actor } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import me from '../../server/api/availability/me.get'
import newPattern from '../../server/api/availability/patterns/index.post'
import newException from '../../server/api/availability/exceptions/index.post'
import paint from '../../server/api/availability/paint.post'

const app = server({
  'GET /api/availability/me': me,
  'POST /api/availability/patterns': newPattern,
  'POST /api/availability/exceptions': newException,
  'POST /api/availability/paint': paint,
})

const NOV_24 = Date.UTC(2026, 10, 24, 9)

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

const day = async (who: Actor, date = '2027-01-12') =>
  (await req(who, 'GET', `/api/availability/me?from=${date}&to=${date}`)).body.days[0].pieces.map((p: any) => [p.start / 60, p.end / 60, p.level])
const stroke = (fields: Record<string, unknown>) => ({ date: '2027-01-12', from: '19:00', until: '20:00', level: 'free', target: 'days', ...fields })
const tuesdayEvenings = { label: 'Term', startsOn: '2026-12-01', endsOn: null, lines: [{ weekday: 2, from: '18:00', until: '22:00', level: 'busy' }] }

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('availability', true)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
})

beforeEach(() => setClock(NOV_24))

describe('painting a day', () => {
  it('writes one entry for just this week and leaves the pattern alone', async () => {
    const sam = person([])
    await req(sam, 'POST', '/api/availability/patterns', tuesdayEvenings)
    expect((await req(sam, 'POST', '/api/availability/paint', stroke({}))).status).toBe(200)
    expect(await day(sam)).toEqual([[0, 18, 'unknown'], [18, 19, 'busy'], [19, 20, 'free'], [20, 22, 'busy'], [22, 24, 'unknown']])
    expect(await day(sam, '2027-01-19')).toEqual([[0, 18, 'unknown'], [18, 22, 'busy'], [22, 24, 'unknown']])
    expect(await rows('SELECT count(*) AS n FROM availability_exceptions WHERE account_id = ?', sam.accountId)).toEqual([{ n: 1 }])
    expect(await rows('SELECT from_local, until_local FROM availability_pattern_lines l JOIN availability_patterns p ON p.id = l.pattern_id WHERE p.account_id = ?', sam.accountId)).toEqual([{ from_local: '18:00', until_local: '22:00' }])
  })

  it('changes the pattern when asked, joining neighbours of one level', async () => {
    const sam = person([])
    await req(sam, 'POST', '/api/availability/patterns', tuesdayEvenings)
    expect((await req(sam, 'POST', '/api/availability/paint', stroke({ from: '22:00', until: '23:00', level: 'busy', target: 'pattern' }))).status).toBe(200)
    expect(await day(sam, '2027-01-19')).toEqual([[0, 18, 'unknown'], [18, 23, 'busy'], [23, 24, 'unknown']])
    expect((await req(sam, 'POST', '/api/availability/paint', stroke({ from: '18:00', until: '19:00', level: 'clear', target: 'pattern' }))).status).toBe(200)
    expect(await day(sam, '2027-01-19')).toEqual([[0, 19, 'unknown'], [19, 23, 'busy'], [23, 24, 'unknown']])
  })

  it('refuses the pattern when none covers the day', async () => {
    const sam = person([])
    const refused = await req(sam, 'POST', '/api/availability/paint', stroke({ target: 'pattern' }))
    expect([refused.status, refused.body.code]).toEqual([409, 'availability.pattern.none'])
  })

  it('clears a stroke out of a longer entry, keeping its other days and its place in the order', async () => {
    const sam = person([])
    await req(sam, 'POST', '/api/availability/exceptions', { firstDate: '2027-01-11', lastDate: '2027-01-13', weekdays: null, from: null, until: null, level: 'busy', reason: 'Away', reasonShared: true })
    setClock(NOV_24 + 1000)
    await req(sam, 'POST', '/api/availability/exceptions', { firstDate: '2027-01-12', lastDate: '2027-01-12', weekdays: null, from: '10:00', until: '11:00', level: 'free', reason: null, reasonShared: false })
    setClock(NOV_24 + 2000)
    expect((await req(sam, 'POST', '/api/availability/paint', stroke({ from: '09:00', until: '12:00', level: 'clear' }))).status).toBe(200)
    expect(await day(sam)).toEqual([[0, 9, 'busy'], [9, 12, 'unknown'], [12, 24, 'busy']])
    expect(await day(sam, '2027-01-11')).toEqual([[0, 24, 'busy']])
    expect(await day(sam, '2027-01-13')).toEqual([[0, 24, 'busy']])
    expect(await rows('SELECT DISTINCT reason, created_at FROM availability_exceptions WHERE account_id = ?', sam.accountId)).toEqual([{ reason: 'Away', created_at: NOV_24 }])
  })

  it('refuses a day before today and a time off the step', async () => {
    const sam = person([])
    expect((await req(sam, 'POST', '/api/availability/paint', stroke({ date: '2026-11-23' }))).status).toBe(422)
    expect((await req(sam, 'POST', '/api/availability/paint', stroke({ from: '19:10' }))).status).toBe(422)
  })
})
