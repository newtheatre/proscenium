// PP-01 and PP-02 (rules E1, E2, W9): starting a season's plan and filling its tray.
import { describe, expect, it } from 'vitest'
import { newId } from '#kit'
import type { Actor } from '#kit'
import { env, person, rows } from '../../../../tests/integration/helpers'
import { looker, NOV_24, production, programmer, req, season, setting, started, venue } from './stage'

describe('starting a plan (PP-01, E1)', () => {
  it('makes one plan with the season\'s dates and the settings\' day hours', async () => {
    await setting('programme-planning.board.day-starts', '10:00')
    const spring = await season()
    const made = await req(programmer, 'POST', `/api/programme-planning/seasons/${spring.slug}/plan`, {})
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.started).toBe(true)
    const page = await req(programmer, 'GET', `/api/programme-planning/seasons/${spring.slug}`)
    expect(page.body.plan).toMatchObject({ id: made.body.planId, state: 'planning', boardFrom: '2027-01-10', boardTo: '2027-03-20', dayStarts: '10:00', dayEnds: '00:00', publishProductions: true, version: 0 })
    expect(page.body.may).toEqual({ manage: true, viewEntries: true, manageEntries: true })
    expect((await rows('SELECT name FROM core_events WHERE record_id = ?', made.body.planId)).map(r => r.name)).toContain('programme-planning.plan.started')
    await setting('programme-planning.board.day-starts', '09:00')
  })

  it('opens the existing plan on a second start', async () => {
    const spring = await season()
    const first = await started(spring.id)
    const again = await req(programmer, 'POST', `/api/programme-planning/seasons/${spring.slug}/plan`, {})
    expect(again.body).toEqual({ planId: first, started: false })
    expect(await rows('SELECT id FROM programme_planning_plans WHERE season_id = ?', spring.id)).toHaveLength(1)
  })

  it('lets a viewer look but not start, and shows no plan before one is started', async () => {
    const spring = await season()
    const page = await req(looker, 'GET', `/api/programme-planning/seasons/${spring.slug}`)
    expect(page.status).toBe(200)
    expect(page.body.plan).toBeNull()
    expect(page.body.may.manage).toBe(false)
    expect((await req(looker, 'POST', `/api/programme-planning/seasons/${spring.slug}/plan`, {})).status).toBe(403)
  })

  it('reaches only the season a grant is on', async () => {
    const autumn = await season()
    const festival = await season()
    const director = person([], { grants: [{ ability: 'programme-planning.plan.manage', via: 'role', record: { type: 'core.season', id: festival.id } }] } as Partial<Actor>)
    expect((await req(director, 'POST', `/api/programme-planning/seasons/${autumn.slug}/plan`, {})).status).toBe(403)
    const planId = (await req(director, 'POST', `/api/programme-planning/seasons/${festival.slug}/plan`, {})).body.planId
    expect((await req(director, 'POST', `/api/programme-planning/plans/${planId}/entries`, { title: 'Choir', kind: 'event' })).status).toBe(200)
    const list = await req(director, 'GET', '/api/programme-planning/plans')
    expect(list.body.seasons.map((s: { id: string }) => s.id)).toEqual([festival.id])
  })

  it('lists seasons newest first, with what may be started', async () => {
    const older = await season({ startsOn: '2030-01-01', endsOn: '2030-02-01' })
    const newer = await season({ startsOn: '2031-01-01', endsOn: '2031-02-01' })
    await started(older.slug)
    const list = await req(programmer, 'GET', '/api/programme-planning/plans')
    const ids = list.body.seasons.map((s: { id: string }) => s.id)
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id))
    expect(list.body.seasons.find((s: { id: string }) => s.id === newer.id)).toMatchObject({ planId: null, mayStart: true })
    expect(list.body.seasons.find((s: { id: string }) => s.id === older.id)).toMatchObject({ planState: 'planning', mayStart: false, overview: { placed: 0, wanted: 0 } })
  })
})

describe('the tray (PP-02, E2, W9)', () => {
  it('takes a typed-in entry as a candidate and raises the plan\'s version', async () => {
    const spring = await season()
    const planId = await started(spring.slug)
    const made = await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/entries`, { title: 'Brass Quintet', kind: 'visiting', minutes: 60, getInMinutes: 30, getOutMinutes: 15, performancesWanted: 2 })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const list = await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/entries`)
    expect(list.body.entries).toEqual([expect.objectContaining({ id: made.body.entryId, title: 'Brass Quintet', kind: 'visiting', state: 'candidate', source: 'manual', minutes: 60, getInMinutes: 30, getOutMinutes: 15, performancesWanted: 2, placed: 0, inTray: true, productionId: null })])
    expect((await rows<{ version: number }>('SELECT version FROM programme_planning_plans WHERE id = ?', planId))[0]!.version).toBe(1)
  })

  it('refuses an entry with no title or an impossible running time', async () => {
    const planId = await started((await season()).slug)
    expect((await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/entries`, { title: '', kind: 'own' })).status).toBe(422)
    expect((await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/entries`, { title: 'Long', kind: 'own', minutes: 2000 })).status).toBe(422)
  })

  it('brings a draft production of the season onto the board already accepted, listed first', async () => {
    const spring = await season()
    const planId = await started(spring.slug)
    await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/entries`, { title: 'Choir', kind: 'event' })
    const twelfth = await production(spring.id, { title: 'Twelfth Night', minutes: 150 })
    await production(spring.id, { title: 'Published already', state: 'published' })
    await production(null, { title: 'No season' })
    const offered = await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/productions`)
    expect(offered.body.productions).toEqual([{ id: twelfth, title: 'Twelfth Night', kind: 'visiting', runningMinutes: 150 }])
    const brought = await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/bring`, { productionId: twelfth, performancesWanted: 3 })
    expect(brought.status, JSON.stringify(brought.body)).toBe(200)
    const list = await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/entries`)
    expect(list.body.entries.map((e: { title: string, state: string }) => [e.title, e.state])).toEqual([['Twelfth Night', 'accepted'], ['Choir', 'candidate']])
    expect(list.body.entries[0]).toMatchObject({ productionId: twelfth, minutes: 150, performancesWanted: 3, inTray: true })
    expect((await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/productions`)).body.productions).toEqual([])
    const again = await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/bring`, { productionId: twelfth })
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('programme-planning.entry.already-on-board')
  })

  it('refuses a production from another season or no longer a draft', async () => {
    const spring = await season()
    const planId = await started(spring.slug)
    const elsewhere = await production((await season()).id)
    const published = await production(spring.id, { state: 'published' })
    expect((await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/bring`, { productionId: elsewhere })).body.code).toBe('programme-planning.entry.other-season')
    expect((await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/bring`, { productionId: published })).body.code).toBe('programme-planning.entry.not-draft')
  })

  it('takes an entry off the tray once it has the placements it wants, and counts them on the overview', async () => {
    const spring = await season()
    const planId = await started(spring.slug)
    const twelfth = await production(spring.id)
    const entryId = (await req(programmer, 'POST', `/api/programme-planning/plans/${planId}/bring`, { productionId: twelfth, performancesWanted: 1 })).body.entryId
    const place = await venue()
    const performanceId = newId('perf')
    await env.DB.batch([
      env.DB.prepare('INSERT INTO core_performances (id, production_id, venue_id, space_id, starts_at, ends_at, operating_day, state, created_at) VALUES (?, ?, ?, ?, ?, ?, \'2027-01-12\', \'draft\', 0)').bind(performanceId, twelfth, place.venueId, place.spaceId, NOV_24, NOV_24 + 9_000_000),
      env.DB.prepare('INSERT INTO programme_planning_placements (performance_id, entry_id, created_at, updated_at) VALUES (?, ?, 0, 0)').bind(performanceId, entryId),
    ])
    const list = await req(programmer, 'GET', `/api/programme-planning/plans/${planId}/entries`)
    expect(list.body.entries[0]).toMatchObject({ placed: 1, inTray: false })
    expect((await req(programmer, 'GET', `/api/programme-planning/seasons/${spring.id}`)).body.overview).toEqual({ counts: { candidate: 0, accepted: 1, declined: 0, withdrawn: 0 }, placed: 1, wanted: 1 })
  })

  it('refuses entries to someone who may only look', async () => {
    const planId = await started((await season()).slug)
    expect((await req(looker, 'POST', `/api/programme-planning/plans/${planId}/entries`, { title: 'Choir', kind: 'event' })).status).toBe(403)
  })
})
