// A run set up once rather than night by night (box office review S1 and S2): a production's first
// performance starts from its ticket preset, later ones take the run's set-up and go on sale with it,
// and a set-up can be copied to, and the run put on sale, all at once.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { deliver, inContext, rows } from '../../../../tests/integration/helpers'
import { createTicketPreset } from '../../server/ticket-presets'
import { house, NOV_16, ready, req } from './stage'

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
})

const pools = (performanceId: string) => rows<{ name: string, capacity: number }>(
  'SELECT b.name, o.capacity FROM box_office_pools o JOIN box_office_bands b ON b.id = o.band_id WHERE o.performance_id = ? ORDER BY b.sort', performanceId)
const salesState = async (performanceId: string) => (await rows<{ state: string }>('SELECT state FROM box_office_performance_sales WHERE performance_id = ?', performanceId))[0]?.state ?? null

async function newPerformance(productionId: string, venue: { venueId: string, spaceId: string }, day: number, schedule = true): Promise<string> {
  const made = await req('POST', `/api/core/productions/${productionId}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.UTC(2027, 5, day, 19, 30), capacity: 100 })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  if (schedule) expect((await req('POST', `/api/core/performances/${made.body.id}/schedule`, {})).status).toBe(200)
  return made.body.id
}

describe('a production\'s first performance', () => {
  it('starts from its space\'s ticket preset: sections, the production\'s prices and the seats', async () => {
    const h = await house(5) // for the ticket type ids
    await deliver()
    const venue = (await req('POST', '/api/core/venues', { name: 'Preset venue' })).body
    await inContext(async () => {
      const unit = createUnit()
      await createTicketPreset(unit.view(), { name: 'Two levels', spaceIds: [venue.spaceId], sections: [
        { name: 'Stalls', seats: 60, prices: [{ ticketTypeId: h.fullId, amountMinor: 1500 }, { ticketTypeId: h.concessionId, amountMinor: 1000 }] },
        { name: 'Circle', seats: null, prices: [{ ticketTypeId: h.fullId, amountMinor: 1200 }] },
      ] }, null)
      await unit.commit()
    })
    const production = (await req('POST', '/api/core/productions', { title: 'Our Town', kind: 'own' })).body
    const first = await newPerformance(production.id, venue, 1)
    await deliver()
    // The Circle takes the rest of the house: 100 less the Stalls' 60.
    expect(await pools(first)).toEqual([{ name: 'Stalls', capacity: 60 }, { name: 'Circle', capacity: 40 }])
    const priced = await rows<{ amount_minor: number, performance_id: string | null }>('SELECT amount_minor, performance_id FROM box_office_prices p JOIN box_office_bands b ON b.id = p.band_id WHERE b.production_id = ? ORDER BY amount_minor', production.id)
    expect(priced).toEqual([{ amount_minor: 1000, performance_id: null }, { amount_minor: 1200, performance_id: null }, { amount_minor: 1500, performance_id: null }])
    // Set up, not on sale: the first performance goes on sale when someone says so.
    expect(await salesState(first)).toBe('draft')
  })
})

describe('a date added to a run', () => {
  it('takes the run\'s seats and goes on sale with it', async () => {
    const h = await house(30)
    await deliver()
    const venue = (await req('POST', '/api/core/venues', { name: 'Run venue' })).body
    const second = await newPerformance(h.productionId, venue, 2)
    await deliver()
    expect(await pools(second)).toEqual([{ name: 'Stalls', capacity: 30 }])
    expect(await salesState(second)).toBe('on_sale')
  })

  it('waits to be put on sale when the theatre has turned that off', async () => {
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'box-office.runs.open-new-dates', false, { reason: 'test' })
      await unit.commit()
    })
    const h = await house(20)
    await deliver()
    const venue = (await req('POST', '/api/core/venues', { name: 'Waiting venue' })).body
    const second = await newPerformance(h.productionId, venue, 3)
    await deliver()
    expect(await pools(second)).toEqual([{ name: 'Stalls', capacity: 20 }])
    expect(await salesState(second)).toBe('draft')
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'box-office.runs.open-new-dates', true, { reason: 'test' })
      await unit.commit()
    })
  })
})

describe('the whole run at once', () => {
  it('copies a set-up to every performance with none, and puts every ready one on sale', async () => {
    const h = await house(12, { open: false })
    await deliver()
    const venue = (await req('POST', '/api/core/venues', { name: 'Whole run venue' })).body
    // Drafts, not yet scheduled, so nothing sets them up on its own.
    const a = await newPerformance(h.productionId, venue, 4, false)
    const b = await newPerformance(h.productionId, venue, 5, false)
    const copied = await req('POST', `/api/box-office/performances/${h.performanceId}/sales/copy-to-run`, {})
    expect(copied.status, JSON.stringify(copied.body)).toBe(200)
    expect(copied.body).toEqual({ done: 2, skipped: [] })
    expect(await pools(a)).toEqual([{ name: 'Stalls', capacity: 12 }])
    expect(await pools(b)).toEqual([{ name: 'Stalls', capacity: 12 }])

    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 900 }] })
    const opened = await req('POST', `/api/box-office/productions/${h.productionId}/sales/open`, {})
    expect(opened.status, JSON.stringify(opened.body)).toBe(200)
    // The scheduled one goes on sale; the two drafts are named as not ready.
    expect(opened.body.done).toBe(1)
    expect(opened.body.skipped).toEqual(expect.arrayContaining([{ performanceId: a, reason: 'scheduled' }, { performanceId: b, reason: 'scheduled' }]))
    expect(await salesState(h.performanceId)).toBe('on_sale')
  })
})

describe('the Tickets tab', () => {
  it('sets the run\'s seats once, keeps a night\'s own seats, and lists the run\'s prices', async () => {
    const h = await house(10, { open: false })
    await deliver()
    const venue = (await req('POST', '/api/core/venues', { name: 'Tab venue' })).body
    const a = await newPerformance(h.productionId, venue, 6, false)
    const b = await newPerformance(h.productionId, venue, 7, false)
    await req('PUT', `/api/box-office/performances/${a}/sales`, { pools: [{ bandId: h.bandId, capacity: 10 }] })
    // One night has seats of its own.
    await req('PUT', `/api/box-office/performances/${b}/sales`, { pools: [{ bandId: h.bandId, capacity: 4 }] })
    const before = (await req('GET', `/api/box-office/productions/${h.productionId}/tickets`)).body
    expect(before.runSeats).toEqual({ [h.bandId]: 10 })
    expect(before.performances.find((p: { id: string }) => p.id === b).ownSeats).toBe(true)

    const set = await req('PUT', `/api/box-office/productions/${h.productionId}/sales/seats`, { pools: [{ bandId: h.bandId, capacity: 25 }] })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    expect(set.body).toMatchObject({ done: 2, skipped: [] })
    expect(set.body.performanceIds.sort()).toEqual([h.performanceId, a].sort())
    expect(await pools(h.performanceId)).toEqual([{ name: 'Stalls', capacity: 25 }])
    expect(await pools(b)).toEqual([{ name: 'Stalls', capacity: 4 }])

    // Undo names the nights it changed, so the night with its own seats is not touched.
    await req('PUT', `/api/box-office/productions/${h.productionId}/sales/seats`, { pools: [{ bandId: h.bandId, capacity: 10 }], performanceIds: set.body.performanceIds })
    expect(await pools(a)).toEqual([{ name: 'Stalls', capacity: 10 }])

    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 1100 }] })
    const after = (await req('GET', `/api/box-office/productions/${h.productionId}/tickets`)).body
    expect(after.runPrices).toEqual([{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 1100 }])
    expect(after.sections.map((x: { name: string }) => x.name)).toEqual(['Stalls'])
  })
})
