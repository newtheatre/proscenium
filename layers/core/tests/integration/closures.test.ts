// C-18: closures for the whole theatre, a venue or one space. Whole-day closures run over operating
// days in the theatre's time zone; timed ones are entered in local time. The predicate other
// modules put on their own writes sees a blocking closure in the space, its venue or the theatre.
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import listClosures from '../../server/api/core/closures/index.get'
import createClosure from '../../server/api/core/closures/index.post'
import deleteClosure from '../../server/api/core/closures/[id]/index.delete'
import createVenue from '../../server/api/core/venues/index.post'
import addSpace from '../../server/api/core/venues/[id]/spaces/index.post'
import { assertNoBlockingClosure } from '../../server/services'
import { changeSetting, createUnit, useDb } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/closures': listClosures,
  'POST /api/core/closures': createClosure,
  'DELETE /api/core/closures/:id': deleteClosure,
  'POST /api/core/venues': createVenue,
  'POST /api/core/venues/:id/spaces': addSpace,
})
const admin = person(['core.closure.manage', 'core.venue.manage'])
const member = person([])

async function json<T = any>(response: Promise<Response>): Promise<{ status: number, body: T }> {
  const r = await response
  return { status: r.status, body: await r.json() as T }
}
const post = (body: object) => json(call(handle, 'POST', '/api/core/closures', { actor: admin, body }))

let n = 0
async function venueWithTwoSpaces(): Promise<{ venueId: string, main: string, studio: string }> {
  const { body } = await json(call(handle, 'POST', '/api/core/venues', { actor: admin, body: { name: `Closure venue ${++n}` } }))
  const kind = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'core.space-kind' AND slug = 'studio'"))[0]!.id
  const studio = await json(call(handle, 'POST', `/api/core/venues/${body.venueId}/spaces`, { actor: admin, body: { name: 'Studio', kindTermId: kind } }))
  return { venueId: body.venueId, main: body.spaceId, studio: studio.body.id }
}

async function blocked(spaceId: string, from: string, to: string): Promise<boolean> {
  const [row] = await inContext(() => useDb().all<{ free: number }>(sql`SELECT ${assertNoBlockingClosure(spaceId, Date.parse(from), Date.parse(to))} AS free`))
  return !row!.free
}

beforeEach(async () => {
  resetRateLimits()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit, 'core.locale.time-zone', 'Europe/London', { confirm: true })
    await unit.commit()
  })
})
afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM core_closures'),
    env.DB.prepare("DELETE FROM core_settings WHERE key = 'core.locale.time-zone'"),
  ])
})

describe('closures', () => {
  it('need the ability', async () => {
    expect((await call(handle, 'GET', '/api/core/closures', { actor: member })).status).toBe(403)
    expect((await call(handle, 'POST', '/api/core/closures', { actor: member, body: { title: 'Nope', allDay: true, from: '2026-12-25', to: '2026-12-25' } })).status).toBe(403)
  })

  it('run over whole operating days for the whole theatre, and announce', async () => {
    const { status, body } = await post({ title: 'Christmas', allDay: true, from: '2026-12-25', to: '2026-12-26' })
    expect(status).toBe(200)
    const [row] = await rows<{ starts_at: number, ends_at: number, blocks_performances: number, kind: string, source: string }>('SELECT * FROM core_closures WHERE id = ?', body.id)
    // The day starts at 04:00, London is on GMT in December.
    expect(row).toMatchObject({ starts_at: Date.parse('2026-12-25T04:00:00Z'), ends_at: Date.parse('2026-12-27T04:00:00Z'), blocks_performances: 1, kind: 'closure', source: 'manual' })
    expect(await rows('SELECT name FROM core_events WHERE name = ? AND record_id = ?', 'core.closure.created', body.id)).toHaveLength(1)
    expect(await rows('SELECT action FROM core_audit WHERE record_type = ? AND record_id = ?', 'core.closure', body.id)).toEqual([{ action: 'create' }])
  })

  it('take local times in the theatre\'s time zone', async () => {
    const { main, venueId } = await venueWithTwoSpaces()
    const { body } = await post({ venueId, spaceId: main, title: 'Get-in', allDay: false, from: '2027-07-01T10:00', to: '2027-07-01T12:30', blocksPerformances: false })
    const [row] = await rows<{ starts_at: number, ends_at: number, blocks_performances: number }>('SELECT * FROM core_closures WHERE id = ?', body.id)
    expect(row).toMatchObject({ starts_at: Date.parse('2027-07-01T09:00:00Z'), ends_at: Date.parse('2027-07-01T11:30:00Z'), blocks_performances: 0 })
  })

  it('refuse a period that ends first, a space without its venue, and a space from another venue', async () => {
    const a = await venueWithTwoSpaces()
    const b = await venueWithTwoSpaces()
    expect((await post({ title: 'Backwards', allDay: false, from: '2027-01-02T10:00', to: '2027-01-02T09:00' })).body.code).toBe('core.closure.period')
    expect((await post({ title: 'Mixed', allDay: true, from: '2027-01-02T10:00', to: '2027-01-02' })).status).toBe(422)
    expect((await post({ spaceId: a.main, title: 'No venue', allDay: true, from: '2027-01-02', to: '2027-01-02' })).body.code).toBe('core.closure.scope')
    expect((await post({ venueId: b.venueId, spaceId: a.main, title: 'Wrong venue', allDay: true, from: '2027-01-02', to: '2027-01-02' })).status).toBe(404)
  })

  it('reach a space from the theatre, its venue or itself, never from the space next door', async () => {
    const { venueId, main, studio } = await venueWithTwoSpaces()
    await post({ title: 'Whole theatre', allDay: true, from: '2027-02-01', to: '2027-02-01' })
    await post({ venueId, title: 'Whole venue', allDay: true, from: '2027-02-02', to: '2027-02-02' })
    await post({ venueId, spaceId: studio, title: 'Studio only', allDay: true, from: '2027-02-03', to: '2027-02-03' })
    await post({ venueId, spaceId: main, title: 'Main, not blocking', allDay: true, from: '2027-02-04', to: '2027-02-04', blocksPerformances: false })

    const listed = async (q: string) => (await json(call(handle, 'GET', `/api/core/closures?from=${Date.parse('2027-01-31T00:00:00Z')}&to=${Date.parse('2027-02-10T00:00:00Z')}${q}`, { actor: admin }))).body.rows.map((c: { title: string }) => c.title)
    expect(await listed('')).toEqual(['Whole theatre', 'Whole venue', 'Studio only', 'Main, not blocking'])
    expect(await listed(`&spaceId=${main}`)).toEqual(['Whole theatre', 'Whole venue', 'Main, not blocking'])
    expect(await listed(`&venueId=${venueId}`)).toEqual(['Whole theatre', 'Whole venue', 'Studio only', 'Main, not blocking'])

    const evening = (day: string) => [`${day}T19:30:00Z`, `${day}T22:00:00Z`] as const
    expect(await blocked(main, ...evening('2027-02-01'))).toBe(true)
    expect(await blocked(main, ...evening('2027-02-02'))).toBe(true)
    expect(await blocked(main, ...evening('2027-02-03'))).toBe(false)
    expect(await blocked(studio, ...evening('2027-02-03'))).toBe(true)
    expect(await blocked(main, ...evening('2027-02-04'))).toBe(false)
    // 00:30 on the 3rd belongs to the 2nd's operating day, which the venue closure covers.
    expect(await blocked(main, '2027-02-03T00:30:00Z', '2027-02-03T01:30:00Z')).toBe(true)
  })

  it('are deleted with an announcement, but a public holiday from the feed stays', async () => {
    const { body } = await post({ title: 'Deep clean', allDay: true, from: '2027-03-01', to: '2027-03-01' })
    expect((await call(handle, 'DELETE', `/api/core/closures/${body.id}`, { actor: admin })).status).toBe(200)
    expect(await rows('SELECT id FROM core_closures WHERE id = ?', body.id)).toHaveLength(0)
    expect(await rows('SELECT name FROM core_events WHERE name = ? AND record_id = ?', 'core.closure.removed', body.id)).toHaveLength(1)

    await env.DB.prepare("INSERT INTO core_closures (id, kind, title, starts_at, ends_at, all_day, blocks_performances, source, feed_ref, created_at) VALUES ('clo_holiday', 'public_holiday', 'Bank holiday', 1, 2, 1, 0, 'feed', 'gb:2027-05-03', 0)").run()
    expect((await json(call(handle, 'DELETE', '/api/core/closures/clo_holiday', { actor: admin }))).body.code).toBe('core.closure.from-feed')
  })
})
