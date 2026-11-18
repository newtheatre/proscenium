// The command palette finds records by name (H9): productions, seasons and venues through their own
// search routes, shown through /api/core/records, and only for someone who may open them.
import { describe, expect, it } from 'vitest'
import createSeason from '../../server/api/core/seasons/index.post'
import createProduction from '../../server/api/core/productions/index.post'
import createVenue from '../../server/api/core/venues/index.post'
import searchProductions from '../../server/api/core/search/productions.get'
import searchSeasons from '../../server/api/core/search/seasons.get'
import searchVenues from '../../server/api/core/search/venues.get'
import palette from '../../server/api/core/palette.get'
import records from '../../server/api/core/records.get'
import { call, person, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/seasons': createSeason,
  'POST /api/core/productions': createProduction,
  'POST /api/core/venues': createVenue,
  'GET /api/core/search/productions': searchProductions,
  'GET /api/core/search/seasons': searchSeasons,
  'GET /api/core/search/venues': searchVenues,
  'GET /api/core/palette': palette,
  'GET /api/core/records': records,
})
const producer = person(['core.production.create', 'core.season.manage', 'core.venue.manage'])
const stranger = person([])

const get = async (path: string, actor = producer) => {
  const r = await call(handle, 'GET', path, { actor })
  return { status: r.status, body: await r.json() as any }
}
const post = async (path: string, body: object) => (await call(handle, 'POST', path, { actor: producer, body })).json() as Promise<any>

describe('the palette\'s record search', () => {
  it('finds a production, a season and a venue by part of its name and resolves each to its page', async () => {
    const { id } = await post('/api/core/productions', { title: 'The Importance of Being Earnest', kind: 'own' })
    await post('/api/core/seasons', { name: 'Autumn 2026', startsOn: '2026-09-01', endsOn: '2026-12-31' })
    const { venueId } = await post('/api/core/venues', { name: 'The Old Market' })

    const found = await get('/api/core/search/productions?q=earnest')
    expect(found.body.ids).toEqual([id])
    const shown = await get(`/api/core/records?type=core.production&ids=${id}`)
    expect(shown.body.records).toEqual([{ type: 'core.production', id, title: 'The Importance of Being Earnest', to: `/console/programme/productions/${id}` }])

    const seasons = await get('/api/core/search/seasons?q=autumn')
    expect(seasons.body.ids).toHaveLength(1)
    const venues = await get('/api/core/search/venues?q=old market')
    expect(venues.body.ids).toEqual([venueId])
    const venue = await get(`/api/core/records?type=core.venue&ids=${venueId}`)
    expect(venue.body.records[0]).toMatchObject({ title: 'The Old Market', to: `/admin/modules/core/venues/${venueId}` })
  })

  it('offers its sources, set-up screens and actions only to someone who may use them', async () => {
    const mine = await get('/api/core/palette')
    expect(mine.body.sources.map((s: { record: string }) => s.record)).toEqual(expect.arrayContaining(['core.production', 'core.season', 'core.venue']))
    expect(mine.body.sources.map((s: { record: string }) => s.record)).not.toContain('core.account')
    expect(mine.body.screens.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining(['core.venues', 'core.seasons']))
    expect(mine.body.actions.map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining(['core.new-production', 'core.new-venue']))
    expect(mine.body.actions.map((a: { id: string }) => a.id)).not.toContain('core.give-role')

    expect((await get('/api/core/search/productions?q=earnest', stranger)).status).toBe(403)
    expect((await get('/api/core/records?type=core.production&ids=x', stranger)).body).toEqual({ records: [] })
  })
})
