// The Performances list and a performance's set-up as the console reads them: each performance to
// come with its sale state and seats taken, and the set-up naming the performance and its bands.
import { beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { house, NOV_16, ready, req, type House } from './stage'

let onSale: House
let notYet: House

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  onSale = await house(30)
  notYet = await house(10, { open: false })
})

describe('the Performances list', () => {
  it('shows each performance to come with its sale state and seats', async () => {
    const seen = await req('GET', '/api/box-office/performances')
    expect(seen.status).toBe(200)
    const row = (id: string) => seen.body.performances.find((p: { id: string }) => p.id === id)
    expect(row(onSale.performanceId)).toMatchObject({ productionId: onSale.productionId, sales: 'on_sale', capacity: 30, taken: 0, scheduled: true })
    expect(row(notYet.performanceId).sales).not.toBe('on_sale')
    expect(row(onSale.performanceId).title).toBeTruthy()
  })
})

describe('a performance\'s set-up', () => {
  it('names the performance and lists its production\'s bands', async () => {
    const seen = await req('GET', `/api/box-office/performances/${onSale.performanceId}/sales`)
    // The production is still in draft, which the page warns about.
    expect(seen.body.performance).toMatchObject({ id: onSale.performanceId, productionId: onSale.productionId, productionState: 'draft' })
    expect(seen.body.bands.map((b: { id: string }) => b.id)).toContain(onSale.bandId)
  })
})

describe('a production\'s Tickets tab', () => {
  it('sums the run and says whether the production is published', async () => {
    const seen = await req('GET', `/api/box-office/productions/${onSale.productionId}/tickets`)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body.production).toMatchObject({ id: onSale.productionId, state: 'draft' })
    expect(seen.body.performances).toEqual([expect.objectContaining({ id: onSale.performanceId, sales: 'on_sale', capacity: 30, taken: 0, scheduled: true })])
    expect(seen.body.totals).toEqual({ performances: 1, onSale: 1, taken: 0, capacity: 30 })
    const other = await req('GET', `/api/box-office/productions/${notYet.productionId}/tickets`)
    expect(other.body.totals).toMatchObject({ performances: 1, onSale: 0 })
  })
})
