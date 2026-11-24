// PP-03 (O1 to O4, W12): the board's one read, with this plan's placements in front of everything else.
import { describe, expect, it } from 'vitest'
import { newId } from '#kit'
import { env, person } from '../../../../tests/integration/helpers'
import { production, programmer, req, season, started, venue } from './stage'

const HOUR = 3_600_000
// 12 January 2027 is in winter, so London is on UTC.
const JAN_12 = Date.UTC(2027, 0, 12)

async function performance(productionId: string, place: { venueId: string, spaceId: string }, at: number, state = 'draft'): Promise<string> {
  const id = newId('perf')
  await env.DB.prepare('INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, ends_at, operating_day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .bind(id, productionId, place.venueId, place.spaceId, at, at + 2 * HOUR, new Date(at).toISOString().slice(0, 10), state).run()
  return id
}

describe('the board (PP-03)', () => {
  it('reads the fourteen-day stretch holding a day, with the days either side', async () => {
    const planId = await started((await season({ startsOn: '2027-01-10', endsOn: '2027-03-20' })).slug)
    const first = await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/board`)
    expect(first.body.days.map((d: { day: string }) => d.day)).toEqual(expect.arrayContaining(['2027-01-10', '2027-01-23']))
    expect(first.body).toMatchObject({ before: null, after: '2027-01-24' })
    const later = await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/board?day=2027-01-30`)
    expect([later.body.days[0].day, later.body.days.at(-1).day, later.body.before, later.body.after]).toEqual(['2027-01-24', '2027-02-06', '2027-01-23', '2027-02-07'])
    const last = await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/board?day=2027-03-20`)
    expect([last.body.days[0].day, last.body.days.at(-1).day, last.body.after]).toEqual(['2027-03-07', '2027-03-20', null])
  })

  it('reads each board space\'s day, this plan\'s placements marked and others behind', async () => {
    const spring = await season()
    const planId = await started(spring.slug)
    const place = await venue('Board venue')
    const twelfth = await production(spring.id, { title: 'Twelfth Night' })
    const entryId = (await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/bring`, { productionId: twelfth })).body.entryId
    const placed = await performance(twelfth, place, JAN_12 + 19 * HOUR)
    await env.DB.prepare('INSERT INTO programme_planning_placements (performance_id, entry_id, created_at, updated_at) VALUES (?, ?, 0, 0)').bind(placed, entryId).run()
    const other = await production(null, { title: 'Someone else\'s show' })
    const behind = await performance(other, place, JAN_12 + 14 * HOUR, 'scheduled')

    const board = await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/board?from=2027-01-12&to=2027-01-13`)
    expect(board.status, JSON.stringify(board.body)).toBe(200)
    expect(board.body.days).toEqual([
      { day: '2027-01-12', start: JAN_12 + 9 * HOUR, end: JAN_12 + 24 * HOUR },
      { day: '2027-01-13', start: JAN_12 + 33 * HOUR, end: JAN_12 + 48 * HOUR },
    ])
    expect(board.body.plan).toMatchObject({ id: planId, version: 1 })
    expect(board.body.spaces).toContainEqual(expect.objectContaining({ id: place.spaceId, venue: 'Board venue' }))
    const items = board.body.occupancy.find((s: { spaceId: string }) => s.spaceId === place.spaceId).items
    expect(items).toEqual([
      expect.objectContaining({ record: { type: 'core.performance', id: behind }, kind: 'performance-scheduled', placement: null, label: null }),
      expect.objectContaining({ record: { type: 'core.performance', id: placed }, kind: 'performance-draft', placement: { entryId, title: 'Twelfth Night' } }),
    ])
  })

  it('labels another show only for someone who may see it (O2)', async () => {
    const spring = await season()
    const planId = await started(spring.slug)
    const place = await venue('Label venue')
    await performance(await production(null, { title: 'Visible show' }), place, JAN_12 + 14 * HOUR, 'scheduled')
    const reader = person(['programme-planning.plan.manage', 'core.production.view'])
    const board = await req(reader, 'GET', `/api/programme-planning/plans/${planId}/board?from=2027-01-12`)
    expect(board.body.occupancy.find((s: { spaceId: string }) => s.spaceId === place.spaceId).items[0].label).toBe('Visible show')
  })

  it('refuses more than fourteen days in one read, and a reader without the season', async () => {
    const planId = await started((await season()).slug)
    expect((await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/board?from=2027-01-01&to=2027-01-15`)).body.code).toBe('programme-planning.board.too-long')
    expect((await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/board?from=2027-01-01&to=2027-01-14`)).status).toBe(200)
    const elsewhere = person([], { grants: [{ ability: 'programme-planning.plan.view', via: 'role', record: { type: 'core.season', id: (await season()).id } }] } as never)
    expect((await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/board`)).body.days).toHaveLength(14)
    expect((await req(elsewhere, 'GET', `/api/programme-planning/plans/${planId}/board`)).status).toBe(403)
  })
})
